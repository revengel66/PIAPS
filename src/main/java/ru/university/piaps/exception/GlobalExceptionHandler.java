package ru.university.piaps.exception;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError(ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        return ResponseEntity.badRequest().body(errors);
    }

    @ExceptionHandler(BusinessValidationException.class)
    public ResponseEntity<ApiError> handleBusinessValidation(BusinessValidationException ex) {
        return ResponseEntity.badRequest().body(new ApiError(ex.getMessage()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDataIntegrity(DataIntegrityViolationException ex) {
        String normalized = rootMessage(ex).toLowerCase();
        if (normalized.contains("record_book")
                || normalized.contains("study_contract_number")
                || normalized.contains("uk_3s3di2tnfdi74uqxol46pjpyo")
                || normalized.contains("uq_students_record_book_seed")
                || normalized.contains("uq_students_contract_seed")) {
            return ResponseEntity.badRequest()
                    .body(new ApiError("Студент с таким номером зачётки или договора существует."));
        }
        if (normalized.contains("duplicate key value violates unique constraint")
                && (normalized.contains("students") || normalized.contains("student"))) {
            return ResponseEntity.badRequest()
                    .body(new ApiError("Студент с таким номером зачётки или договора существует."));
        }
        if (normalized.contains("student_state_history_status_check")
                || normalized.contains("students_status_check")) {
            return ResponseEntity.badRequest()
                    .body(new ApiError("Указан некорректный статус студента."));
        }
        if (normalized.contains("foreign key")
                && (normalized.contains("group_id") || normalized.contains("students_group_id_fkey"))) {
            return ResponseEntity.badRequest()
                    .body(new ApiError("Выбрана несуществующая группа."));
        }
        if (normalized.contains("orders_number_key")
                || normalized.contains("orders.number")
                || normalized.contains("uk_orders_number")) {
            return ResponseEntity.badRequest()
                    .body(new ApiError("Приказ с таким номером уже существует."));
        }
        return ResponseEntity.badRequest().body(new ApiError("Нарушена целостность данных."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneral(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError(ex.getMessage()));
    }

    private String rootMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current.getMessage() == null ? "" : current.getMessage();
    }
}
