package ru.university.piaps.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import ru.university.piaps.logging.ErrorLogSupport;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger OPERATION_LOG = LoggerFactory.getLogger("OPERATION_LOGGER");
    private static final Logger ERROR_LOG = LoggerFactory.getLogger("ERROR_DIAGNOSTICS_LOGGER");

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex, HttpServletRequest request) {
        OPERATION_LOG.warn("[ПРЕДУПРЕЖДЕНИЕ] Ресурс не найден: {} | сообщение={}", requestInfo(request), ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError(ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        Map<String, String> errors = new HashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        OPERATION_LOG.warn("[ПРЕДУПРЕЖДЕНИЕ] Ошибка валидации: {} | поля={}", requestInfo(request), errors);
        return ResponseEntity.badRequest().body(errors);
    }

    @ExceptionHandler(BusinessValidationException.class)
    public ResponseEntity<ApiError> handleBusinessValidation(BusinessValidationException ex, HttpServletRequest request) {
        OPERATION_LOG.warn("[ПРЕДУПРЕЖДЕНИЕ] Бизнес-валидация не пройдена: {} | сообщение={}",
                requestInfo(request), ex.getMessage());
        return ResponseEntity.badRequest().body(new ApiError(ex.getMessage()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDataIntegrity(DataIntegrityViolationException ex, HttpServletRequest request) {
        String rootMessage = ErrorLogSupport.rootMessage(ex);
        String normalized = rootMessage.toLowerCase(Locale.ROOT);
        String userMessage = resolveDataIntegrityMessage(normalized);
        String explanation = resolveDataIntegrityExplanation(normalized);
        String source = ErrorLogSupport.sourceLink(ex);

        ERROR_LOG.error("[ОШИБКА ДАННЫХ] {} | расшифровка={} | техническая причина={} | источник={}",
                requestInfo(request), explanation, rootMessage, source, ex);
        return ResponseEntity.badRequest().body(new ApiError(userMessage));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneral(Exception ex, HttpServletRequest request) {
        String source = ErrorLogSupport.sourceLink(ex);
        String decoded = decodeGeneralError(ex);
        ERROR_LOG.error("[НЕОБРАБОТАННАЯ ОШИБКА] {} | расшифровка={} | техническая причина={} | источник={}",
                requestInfo(request), decoded, ErrorLogSupport.rootMessage(ex), source, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("Внутренняя ошибка сервера. Подробности записаны в журнал ошибок."));
    }

    private String requestInfo(HttpServletRequest request) {
        if (request == null) {
            return "запрос не определён";
        }
        return request.getMethod() + " " + request.getRequestURI();
    }

    private String decodeGeneralError(Exception ex) {
        if (ex instanceof NullPointerException) {
            return "Обнаружено обращение к пустой ссылке (NullPointerException). Проверьте входные данные и инициализацию объектов.";
        }
        if (ex instanceof IllegalArgumentException) {
            return "Передан недопустимый аргумент. Проверьте корректность параметров запроса.";
        }
        if (ex instanceof IllegalStateException) {
            return "Система находится в недопустимом состоянии для выполнения операции.";
        }
        return "Необработанное исключение. Требуется диагностика по стеку вызовов и источнику ошибки.";
    }

    private String resolveDataIntegrityMessage(String normalized) {
        if (normalized.contains("record_book")
                || normalized.contains("study_contract_number")
                || normalized.contains("uk_3s3di2tnfdi74uqxol46pjpyo")
                || normalized.contains("uq_students_record_book_seed")
                || normalized.contains("uq_students_contract_seed")) {
            return "Студент с таким номером зачётки или договора существует.";
        }
        if (normalized.contains("duplicate key value violates unique constraint")
                && (normalized.contains("students") || normalized.contains("student"))) {
            return "Студент с таким номером зачётки или договора существует.";
        }
        if (normalized.contains("student_state_history_status_check")
                || normalized.contains("students_status_check")) {
            return "Указан некорректный статус студента.";
        }
        if (normalized.contains("foreign key")
                && (normalized.contains("group_id") || normalized.contains("students_group_id_fkey"))) {
            return "Выбрана несуществующая группа.";
        }
        if (normalized.contains("orders_number_key")
                || normalized.contains("orders.number")
                || normalized.contains("uk_orders_number")) {
            return "Приказ с таким номером уже существует.";
        }
        return "Нарушена целостность данных.";
    }

    private String resolveDataIntegrityExplanation(String normalized) {
        if (normalized.contains("record_book")
                || normalized.contains("study_contract_number")
                || normalized.contains("uq_students_record_book_seed")
                || normalized.contains("uq_students_contract_seed")) {
            return "Нарушена уникальность: номер зачётной книжки или договора уже используется другим студентом.";
        }
        if (normalized.contains("orders_number_key")
                || normalized.contains("orders.number")
                || normalized.contains("uk_orders_number")) {
            return "Нарушена уникальность номера приказа: запись с таким номером уже существует.";
        }
        if (normalized.contains("foreign key")
                && (normalized.contains("group_id") || normalized.contains("students_group_id_fkey"))) {
            return "Нарушена ссылочная целостность: указана группа, которой нет в базе.";
        }
        if (normalized.contains("status_check")) {
            return "Нарушено ограничение допустимых значений статуса студента.";
        }
        return "Нарушено ограничение целостности базы данных (уникальность, внешний ключ или check-ограничение).";
    }
}
