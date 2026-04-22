package ru.university.piaps.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.OrderDto;
import ru.university.piaps.dto.OrderRequest;
import ru.university.piaps.dto.OrderStudentItemDto;
import ru.university.piaps.exception.BusinessValidationException;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.OrderDocument;
import ru.university.piaps.model.OrderType;
import ru.university.piaps.model.Student;
import ru.university.piaps.model.StudentGroup;
import ru.university.piaps.model.StudentStateHistory;
import ru.university.piaps.model.StudentStatus;
import ru.university.piaps.repository.OrderDocumentRepository;
import ru.university.piaps.repository.StudentGroupRepository;
import ru.university.piaps.repository.StudentRepository;
import ru.university.piaps.repository.StudentStateHistoryRepository;
import ru.university.piaps.service.OrderService;
import ru.university.piaps.service.impl.order.OrderTextStrategyFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {

    private static final TypeReference<List<OrderStudentItemDto>> STUDENT_ITEM_LIST_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<StudentExecutionSnapshot>> EXECUTION_SNAPSHOT_LIST_TYPE = new TypeReference<>() {
    };
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.forLanguageTag("ru-RU"));
    private static final DateTimeFormatter DATE_SHORT_FORMATTER = DateTimeFormatter.ofPattern("dd.MM.yy", Locale.forLanguageTag("ru-RU"));
    private static final DateTimeFormatter DATE_TEXT_FORMATTER = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("ru-RU"));
    private static final Set<String> FACULTY_ABBREVIATION_SKIP_WORDS = Set.of(
            "и", "в", "во", "на", "по", "для", "с", "со", "о", "об", "от", "к", "ко", "у", "из"
    );
    private static final Pattern DIRECTION_CODE_PATTERN = Pattern.compile("(\\d{2}\\.\\d{2}\\.\\d{2})");
    private static final Pattern STUDENT_ACCUSATIVE_PATTERN = Pattern.compile(
            "(студента\\(ку\\)\\s+)([А-ЯЁA-Z][а-яёa-z-]+\\s+[А-ЯЁA-Z][а-яёa-z-]+(?:\\s+[А-ЯЁA-Z][а-яёa-z-]+)?)"
    );
    private static final Set<OrderType> EXECUTABLE_ORDER_TYPES = Set.of(
            OrderType.TRANSFER_NEXT_COURSE,
            OrderType.TRANSFER_DIRECTION,
            OrderType.ACADEMIC_LEAVE,
            OrderType.EXPULSION,
            OrderType.ENROLLMENT
    );
    private static final Pattern ORDER_NUMBER_PATTERN = Pattern.compile("^(\\d{4})-([А-ЯЁ])-([0-9]{3})$");
    private static final Map<OrderType, String> ORDER_NUMBER_CODES = Map.of(
            OrderType.ACADEMIC_LEAVE, "А",
            OrderType.ENROLLMENT, "З",
            OrderType.EXPULSION, "О",
            OrderType.TRANSFER_DIRECTION, "П",
            OrderType.TRANSFER_NEXT_COURSE, "К"
    );

    private final OrderDocumentRepository repository;
    private final StudentRepository studentRepository;
    private final StudentGroupRepository groupRepository;
    private final StudentStateHistoryRepository historyRepository;
    private final OrderTextStrategyFactory textStrategyFactory;
    private final ObjectMapper objectMapper;
    private final StudentStateHistoryService historyService;

    @Override
    @Transactional(readOnly = true)
    public List<OrderDto> findAll() {
        return repository.findAllByOrderByOrderDateDescIdDesc().stream()
                .map(this::toDto)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public OrderDto findById(Long id) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));
        return toDto(document);
    }

    @Override
    @Transactional
    public OrderDto create(OrderRequest request) {
        validateOrderHeader(request, null);
        List<Long> normalizedStudentIds = normalizeStudentIds(request.getStudentIds());
        List<Student> students = loadStudents(normalizedStudentIds);

        validateStudentSelection(request, students, Set.of());
        List<OrderStudentItemDto> studentItems = resolveStudentItems(request, students);
        validateStudentItems(request.getType(), request.getOrderDate(), studentItems);

        OrderDocument document = new OrderDocument();
        apply(request, document, normalizedStudentIds, students, studentItems);
        document.setExecuted(Boolean.FALSE);
        document.setExecutedAt(null);
        document.setExecutionSnapshotJson(null);
        document.setSigned(Boolean.FALSE);
        document.setSignedAt(null);
        request.setStudentsList(document.getStudentsList());
        document.setText(textStrategyFactory.strategyFor(request.getType()).generate(request));

        OrderDocument savedDocument = repository.save(document);
        return toDto(savedDocument);
    }

    @Override
    @Transactional
    public OrderDto update(Long id, OrderRequest request) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));
        ensureNotSigned(document);
        ensureNotExecuted(document);
        validateOrderHeader(request, id);

        List<Long> existingIds = parseStudentIds(document.getStudentIds());
        if (!existingIds.isEmpty() && document.getType() != request.getType()) {
            throw new BusinessValidationException("Нельзя менять тип существующего приказа с уже выбранными студентами. Создайте новый приказ.");
        }

        List<Long> normalizedStudentIds = normalizeStudentIds(request.getStudentIds());
        List<Student> students = loadStudents(normalizedStudentIds);

        Set<Long> unchangedIds = new HashSet<>(existingIds);
        unchangedIds.retainAll(new HashSet<>(normalizedStudentIds));
        validateStudentSelection(request, students, unchangedIds);

        List<OrderStudentItemDto> studentItems = resolveStudentItems(request, students);
        validateStudentItems(request.getType(), request.getOrderDate(), studentItems);

        apply(request, document, normalizedStudentIds, students, studentItems);
        request.setStudentsList(document.getStudentsList());
        document.setText(textStrategyFactory.strategyFor(request.getType()).generate(request));

        OrderDocument savedDocument = repository.save(document);
        return toDto(savedDocument);
    }

    @Override
    @Transactional
    public OrderDto execute(Long id) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));

        ensureExecutableType(document.getType());
        ensureNotSigned(document);
        if (Boolean.TRUE.equals(document.getExecuted())) {
            throw new BusinessValidationException("Приказ уже осуществлён. Повторное выполнение недоступно.");
        }

        List<Long> studentIds = parseStudentIds(document.getStudentIds());
        List<Student> students = loadStudents(studentIds);
        if (students.isEmpty()) {
            throw new BusinessValidationException("В приказе нет студентов для осуществления.");
        }

        List<OrderStudentItemDto> studentItems = parseStudentItems(document.getStudentItemsJson());
        if (studentItems.isEmpty()) {
            studentItems = resolveStudentItems(toRequestForRender(document), students);
        }

        OrderRequest requestForValidation = toRequestForRender(document);
        requestForValidation.setStudentIds(studentIds);
        validateStudentSelection(requestForValidation, students, Set.of());
        validateStudentItems(document.getType(), document.getOrderDate(), studentItems);

        List<StudentExecutionSnapshot> snapshot = buildExecutionSnapshot(students);
        applyStudentStateChanges(document, students, studentItems);

        document.setExecuted(Boolean.TRUE);
        document.setExecutedAt(LocalDate.now());
        document.setExecutionSnapshotJson(serializeExecutionSnapshot(snapshot));

        OrderDocument savedDocument = repository.save(document);
        return toDto(savedDocument);
    }

    @Override
    @Transactional
    public OrderDto sign(Long id) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));

        if (!Boolean.TRUE.equals(document.getExecuted())) {
            throw new BusinessValidationException("Подписать можно только осуществлённый приказ.");
        }
        if (Boolean.TRUE.equals(document.getSigned())) {
            throw new BusinessValidationException("Приказ уже подписан.");
        }

        document.setSigned(Boolean.TRUE);
        document.setSignedAt(LocalDate.now());
        OrderDocument savedDocument = repository.save(document);
        return toDto(savedDocument);
    }

    @Override
    @Transactional
    public OrderDto rollback(Long id) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));

        ensureExecutableType(document.getType());
        ensureNotSigned(document);
        if (!Boolean.TRUE.equals(document.getExecuted())) {
            throw new BusinessValidationException("Можно откатить только уже осуществлённый приказ.");
        }

        List<StudentExecutionSnapshot> snapshot = parseExecutionSnapshot(document.getExecutionSnapshotJson());
        if (snapshot.isEmpty()) {
            throw new BusinessValidationException("Не найдено сохранённое состояние студентов для отката приказа.");
        }

        List<Long> studentIds = snapshot.stream()
                .map(StudentExecutionSnapshot::getStudentId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (studentIds.isEmpty()) {
            throw new BusinessValidationException("Не удалось определить студентов для отката приказа.");
        }

        validateRollbackAllowed(document, studentIds);

        List<Student> students = loadStudents(studentIds);
        Map<Long, StudentExecutionSnapshot> snapshotByStudentId = snapshot.stream()
                .filter(item -> item.getStudentId() != null)
                .collect(Collectors.toMap(StudentExecutionSnapshot::getStudentId, item -> item, (left, right) -> left, LinkedHashMap::new));

        Set<Long> groupIds = snapshot.stream()
                .map(StudentExecutionSnapshot::getGroupId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, StudentGroup> groupsById = groupIds.isEmpty()
                ? Map.of()
                : groupRepository.findAllById(groupIds).stream()
                .collect(Collectors.toMap(StudentGroup::getId, group -> group));

        for (Student student : students) {
            StudentExecutionSnapshot before = snapshotByStudentId.get(student.getId());
            if (before == null) {
                continue;
            }
            student.setStatus(before.getStatus() != null ? before.getStatus() : StudentStatus.ACTIVE);
            student.setCourse(before.getCourse() != null ? before.getCourse() : 1);
            student.setGroup(before.getGroupId() != null ? groupsById.get(before.getGroupId()) : null);
        }

        studentRepository.saveAll(students);
        historyRepository.deleteAllByOrderId(document.getId());

        document.setExecuted(Boolean.FALSE);
        document.setExecutedAt(null);
        document.setExecutionSnapshotJson(null);

        OrderDocument savedDocument = repository.save(document);
        return toDto(savedDocument);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        OrderDocument document = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Приказ не найден"));
        historyRepository.clearOrderReference(document.getId());
        repository.deleteById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] buildPdf(Long id) {
        OrderDto order = findById(id);
        return buildOrderPdf(order);
    }

    private void ensureNotExecuted(OrderDocument document) {
        if (Boolean.TRUE.equals(document.getExecuted())) {
            throw new BusinessValidationException("Нельзя редактировать осуществлённый приказ. Сначала выполните откат.");
        }
    }

    private void ensureNotSigned(OrderDocument document) {
        if (Boolean.TRUE.equals(document.getSigned())) {
            throw new BusinessValidationException("Подписанный приказ нельзя изменить или откатить.");
        }
    }

    private void ensureExecutableType(OrderType type) {
        if (type == null || !EXECUTABLE_ORDER_TYPES.contains(type)) {
            throw new BusinessValidationException("Этот тип приказа не требует осуществления.");
        }
    }

    private void validateOrderHeader(OrderRequest request, Long currentOrderId) {
        if (request == null) {
            throw new BusinessValidationException("Не переданы данные приказа.");
        }

        String normalizedNumber = request.getNumber() == null
                ? null
                : request.getNumber().trim().toUpperCase(Locale.ROOT);
        request.setNumber(normalizedNumber);

        if (!hasText(normalizedNumber)) {
            throw new BusinessValidationException("Укажите номер приказа.");
        }
        if (request.getOrderDate() == null) {
            throw new BusinessValidationException("Укажите дату приказа.");
        }
        if (request.getType() == null) {
            throw new BusinessValidationException("Укажите тип приказа.");
        }

        String expectedCode = ORDER_NUMBER_CODES.get(request.getType());
        if (!hasText(expectedCode)) {
            throw new BusinessValidationException("Не удалось определить формат номера для выбранного типа приказа.");
        }

        String expectedExample = buildOrderNumberExample(request.getType(), request.getOrderDate());
        Matcher matcher = ORDER_NUMBER_PATTERN.matcher(normalizedNumber);
        if (!matcher.matches()) {
            throw new BusinessValidationException("Номер приказа должен быть в формате " + expectedExample + ".");
        }

        int yearInNumber = Integer.parseInt(matcher.group(1));
        if (yearInNumber != request.getOrderDate().getYear()) {
            throw new BusinessValidationException("Год в номере приказа должен совпадать с годом даты приказа.");
        }

        String codeInNumber = matcher.group(2);
        if (!Objects.equals(codeInNumber, expectedCode)) {
            throw new BusinessValidationException("Для выбранного типа приказа используйте номер формата " + expectedExample + ".");
        }

        boolean alreadyExists = currentOrderId == null
                ? repository.existsByNumber(normalizedNumber)
                : repository.existsByNumberAndIdNot(normalizedNumber, currentOrderId);
        if (alreadyExists) {
            throw new BusinessValidationException("Приказ с номером " + normalizedNumber + " уже существует.");
        }
    }

    private String buildOrderNumberExample(OrderType type, LocalDate date) {
        int year = date != null ? date.getYear() : LocalDate.now().getYear();
        String code = ORDER_NUMBER_CODES.getOrDefault(type, "К");
        return year + "-" + code + "-001";
    }

    private List<StudentExecutionSnapshot> buildExecutionSnapshot(List<Student> students) {
        return students.stream()
                .map(student -> new StudentExecutionSnapshot(
                        student.getId(),
                        student.getStatus(),
                        student.getCourse(),
                        student.getGroup() != null ? student.getGroup().getId() : null
                ))
                .toList();
    }

    private String serializeExecutionSnapshot(List<StudentExecutionSnapshot> snapshot) {
        if (snapshot == null || snapshot.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            throw new BusinessValidationException("Не удалось сохранить состояние студентов для отката приказа.");
        }
    }

    private List<StudentExecutionSnapshot> parseExecutionSnapshot(String rawJson) {
        if (!hasText(rawJson)) {
            return List.of();
        }
        try {
            List<StudentExecutionSnapshot> parsed = objectMapper.readValue(rawJson, EXECUTION_SNAPSHOT_LIST_TYPE);
            return parsed == null ? List.of() : parsed;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private void validateRollbackAllowed(OrderDocument document, List<Long> studentIds) {
        for (Long studentId : studentIds) {
            StudentStateHistory latestOrderHistory = historyRepository
                    .findTopByStudentIdAndOrderIsNotNullOrderByEffectiveDateDescIdDesc(studentId)
                    .orElse(null);
            if (latestOrderHistory == null || latestOrderHistory.getOrder() == null) {
                continue;
            }
            if (!Objects.equals(latestOrderHistory.getOrder().getId(), document.getId())) {
                throw new BusinessValidationException(
                        "Откат невозможен: для одного или нескольких студентов уже есть более поздний осуществлённый приказ."
                );
            }
        }
    }

    private void apply(OrderRequest request,
                       OrderDocument document,
                       List<Long> studentIds,
                       List<Student> students,
                       List<OrderStudentItemDto> studentItems) {
        document.setNumber(request.getNumber());
        document.setOrderDate(request.getOrderDate());
        document.setType(request.getType());
        document.setSignDate(request.getSignDate());
        document.setSignerPosition(request.getSignerPosition());
        document.setSignerName(request.getSignerName());

        String studentsList = students.isEmpty()
                ? (hasText(request.getStudentsList()) ? request.getStudentsList().trim() : "")
                : buildDetailedStudentsList(request.getType(), request.getOrderDate(), studentItems);
        document.setStudentsList(studentsList);
        document.setStudentIds(serializeStudentIds(studentIds));
        document.setStudentItemsJson(serializeStudentItems(studentItems));

        document.setPeriodStart(request.getPeriodStart());
        document.setPeriodEnd(request.getPeriodEnd());
        document.setBasis(request.getBasis());
        document.setDirectionName(request.getDirectionName());
        document.setGroupCode(request.getGroupCode());
        document.setEducationForm(request.getEducationForm());
        document.setEducationBase(request.getEducationBase());
        document.setCostInfo(request.getCostInfo());
        document.setExpelDate(request.getExpelDate());
        document.setContractInfo(request.getContractInfo());
        document.setOldDirection(request.getOldDirection());
        document.setOldGroup(request.getOldGroup());
        document.setNewDirection(request.getNewDirection());
        document.setNewGroup(request.getNewGroup());
        document.setPreviousCourse(request.getPreviousCourse());
        document.setNextCourse(request.getNextCourse());
    }

    private void validateStudentSelection(OrderRequest request, List<Student> students, Set<Long> unchangedIds) {
        if (request.getType() == null) {
            throw new BusinessValidationException("Не указан тип приказа.");
        }
        if (students.isEmpty()) {
            if (hasText(request.getStudentsList())) {
                return;
            }
            throw new BusinessValidationException("Выберите хотя бы одного студента.");
        }

        if (request.getType() == OrderType.TRANSFER_NEXT_COURSE
                && request.getPreviousCourse() != null
                && request.getNextCourse() != null
                && request.getNextCourse() <= request.getPreviousCourse()) {
            throw new BusinessValidationException("Следующий курс должен быть больше предыдущего.");
        }

        for (Student student : students) {
            if (unchangedIds.contains(student.getId())) {
                continue;
            }

            StudentStatus status = student.getStatus();
            boolean allowed;
            String allowedHint;

            switch (request.getType()) {
                case ACADEMIC_LEAVE -> {
                    allowed = status == StudentStatus.ACTIVE;
                    allowedHint = "только для студентов со статусом «Обучается»";
                }
                case ENROLLMENT -> {
                    allowed = status == StudentStatus.NEW;
                    allowedHint = "только для студентов со статусом «Новый»";
                }
                case EXPULSION -> {
                    allowed = status == StudentStatus.ACTIVE || status == StudentStatus.ACADEMIC_LEAVE;
                    allowedHint = "только для статусов «Обучается» или «Академ»";
                }
                case TRANSFER_DIRECTION, TRANSFER_NEXT_COURSE -> {
                    allowed = status == StudentStatus.ACTIVE;
                    allowedHint = "только для студентов со статусом «Обучается»";
                }
                default -> {
                    allowed = true;
                    allowedHint = "";
                }
            }

            if (!allowed) {
                throw new BusinessValidationException("Студент " + student.getFullName() + " недоступен для выбранного типа приказа: " + allowedHint + ".");
            }

            if (request.getType() == OrderType.TRANSFER_NEXT_COURSE) {
                if (request.getPreviousCourse() != null && !Objects.equals(student.getCourse(), request.getPreviousCourse())) {
                    throw new BusinessValidationException("Студент " + student.getFullName() + " не соответствует предыдущему курсу " + request.getPreviousCourse() + ".");
                }
                if (request.getNextCourse() != null && request.getNextCourse() <= student.getCourse()) {
                    throw new BusinessValidationException("Для студента " + student.getFullName() + " следующий курс должен быть больше текущего " + student.getCourse() + ".");
                }
            }
        }
    }

    private void validateStudentItems(OrderType type, LocalDate orderDate, List<OrderStudentItemDto> items) {
        if (items == null || items.isEmpty()) {
            return;
        }

        for (OrderStudentItemDto item : items) {
            if (type == OrderType.TRANSFER_NEXT_COURSE) {
                if (item.getFromCourse() != null && item.getToCourse() != null
                        && item.getToCourse() <= item.getFromCourse()) {
                    throw new BusinessValidationException("Для студента " + safe(item.getStudentName()) + " следующий курс должен быть больше предыдущего.");
                }
                if (!hasText(item.getToGroup())) {
                    throw new BusinessValidationException("Для студента " + safe(item.getStudentName()) + " не указана группа перевода.");
                }
            }

            if (type == OrderType.TRANSFER_DIRECTION) {
                if (!hasText(item.getToDirection()) || !hasText(item.getToGroup())) {
                    throw new BusinessValidationException("Для студента " + safe(item.getStudentName()) + " выберите направление и группу перевода.");
                }
            }

            if (type == OrderType.ACADEMIC_LEAVE) {
                if (item.getPeriodStart() == null || item.getPeriodEnd() == null) {
                    throw new BusinessValidationException("Для студента " + safe(item.getStudentName()) + " укажите период академического отпуска.");
                }
                if (!hasText(item.getBasis())) {
                    throw new BusinessValidationException("Для студента " + safe(item.getStudentName()) + " укажите основание предоставления академа.");
                }
            }

            if (type == OrderType.EXPULSION) {
                if (!hasText(item.getBasis())) {
                    throw new BusinessValidationException("Для студента " + safe(item.getStudentName()) + " укажите основание отчисления.");
                }
            }

            if (type == OrderType.ENROLLMENT) {
                if (!hasText(item.getToGroup())) {
                    throw new BusinessValidationException("Для студента " + safe(item.getStudentName()) + " укажите группу зачисления.");
                }
            }

            if ((type == OrderType.TRANSFER_NEXT_COURSE
                    || type == OrderType.TRANSFER_DIRECTION
                    || type == OrderType.ENROLLMENT)
                    && orderDate != null
                    && item.getPeriodStart() != null
                    && item.getPeriodStart().isAfter(orderDate)) {
                throw new BusinessValidationException("Для студента " + safe(item.getStudentName())
                        + " дата решения комиссии/деканата не может быть позже даты приказа.");
            }
        }
    }

    private List<OrderStudentItemDto> resolveStudentItems(OrderRequest request, List<Student> students) {
        List<OrderStudentItemDto> requestItems = request.getStudentItems() == null ? List.of() : request.getStudentItems();
        Map<Long, OrderStudentItemDto> requestItemsByStudentId = new LinkedHashMap<>();
        for (OrderStudentItemDto item : requestItems) {
            if (item != null && item.getStudentId() != null) {
                requestItemsByStudentId.put(item.getStudentId(), item);
            }
        }

        List<OrderStudentItemDto> resolvedItems = new ArrayList<>();
        for (Student student : students) {
            OrderStudentItemDto source = requestItemsByStudentId.get(student.getId());
            OrderStudentItemDto item = source != null
                    ? copyItem(source)
                    : OrderStudentItemDto.builder().studentId(student.getId()).build();
            fillItemDefaults(item, student, request);
            validateTransferDirectionFaculty(student, item, request.getType());
            resolvedItems.add(item);
        }
        return resolvedItems;
    }

    private OrderStudentItemDto copyItem(OrderStudentItemDto source) {
        return OrderStudentItemDto.builder()
                .studentId(source.getStudentId())
                .studentName(source.getStudentName())
                .basis(source.getBasis())
                .fromCourse(source.getFromCourse())
                .toCourse(source.getToCourse())
                .hasAcademicDebts(source.getHasAcademicDebts())
                .facultyName(source.getFacultyName())
                .facultyShortName(source.getFacultyShortName())
                .fromGroup(source.getFromGroup())
                .toGroup(source.getToGroup())
                .fromDirection(source.getFromDirection())
                .toDirection(source.getToDirection())
                .fromDirectionId(source.getFromDirectionId())
                .toDirectionId(source.getToDirectionId())
                .fromGroupId(source.getFromGroupId())
                .toGroupId(source.getToGroupId())
                .educationForm(source.getEducationForm())
                .educationBase(source.getEducationBase())
                .periodStart(source.getPeriodStart())
                .periodEnd(source.getPeriodEnd())
                .studyStartDate(source.getStudyStartDate())
                .studyEndDate(source.getStudyEndDate())
                .specialityName(source.getSpecialityName())
                .contractInfo(source.getContractInfo())
                .contractNumber(source.getContractNumber())
                .tuitionAmount(source.getTuitionAmount())
                .extraInfo(source.getExtraInfo())
                .build();
    }

    private void fillItemDefaults(OrderStudentItemDto item, Student student, OrderRequest request) {
        if (item.getStudentId() == null) {
            item.setStudentId(student.getId());
        }
        if (!hasText(item.getStudentName())) {
            item.setStudentName(student.getFullName());
        }
        OrderType type = request.getType();

        if (item.getFromCourse() == null) {
            item.setFromCourse(student.getCourse());
        }
        if (item.getToCourse() == null) {
            if (type == OrderType.TRANSFER_NEXT_COURSE) {
                item.setToCourse(student.getCourse() == null ? null : student.getCourse() + 1);
            } else if (type == OrderType.ENROLLMENT) {
                item.setToCourse(1);
            } else {
                item.setToCourse(student.getCourse());
            }
        }

        String studentFacultyName = getStudentFacultyName(student);
        String studentFacultyShort = getStudentFacultyShortName(student);
        String studentGroup = student.getGroup() != null ? student.getGroup().getCode() : null;
        Long studentGroupId = student.getGroup() != null ? student.getGroup().getId() : null;
        Long studentDirectionId = student.getGroup() != null && student.getGroup().getDirection() != null
                ? student.getGroup().getDirection().getId()
                : null;
        String studentDirectionTitle = getStudentDirectionTitle(student);
        String studentDirectionCode = getStudentDirectionCode(student);
        String studentDirectionName = getStudentDirectionName(student);

        if (!hasText(item.getFacultyName())) {
            item.setFacultyName(studentFacultyName);
        }
        if (!hasText(item.getFacultyShortName())) {
            item.setFacultyShortName(studentFacultyShort);
        }
        if (!hasText(item.getFromGroup())) {
            item.setFromGroup(studentGroup);
        }
        if (item.getFromGroupId() == null) {
            item.setFromGroupId(studentGroupId);
        }
        if (!hasText(item.getFromDirection())) {
            item.setFromDirection(studentDirectionTitle);
        }
        if (item.getFromDirectionId() == null) {
            item.setFromDirectionId(studentDirectionId);
        }

        if (!hasText(item.getEducationForm())) {
            item.setEducationForm(firstNonBlank(student.getEducationForm(), request.getEducationForm(), "Очная"));
        }
        if (!hasText(item.getEducationBase())) {
            item.setEducationBase(firstNonBlank(student.getEducationBase(), request.getEducationBase(), "Бюджет"));
        }

        if (item.getStudyStartDate() == null) {
            item.setStudyStartDate(student.getStudyStartDate());
        }
        if (item.getStudyEndDate() == null && type == OrderType.EXPULSION) {
            item.setStudyEndDate(request.getOrderDate());
        }
        if (!hasText(item.getContractNumber())) {
            item.setContractNumber(student.getStudyContractNumber());
        }
        if (!hasText(item.getTuitionAmount())) {
            String directionTuition = student.getGroup() != null && student.getGroup().getDirection() != null
                    ? formatMoneyAmount(student.getGroup().getDirection().getAnnualTuition())
                    : null;
            if ("Бюджет".equalsIgnoreCase(safeRaw(item.getEducationBase()))) {
                item.setTuitionAmount("0,00");
            } else {
                item.setTuitionAmount(firstNonBlank(directionTuition, request.getCostInfo(), "0,00"));
            }
        }

        if (!hasText(item.getSpecialityName())) {
            item.setSpecialityName(firstNonBlank(studentDirectionName, request.getDirectionName()));
        }

        if (!hasText(item.getToDirection())) {
            if (type == OrderType.ENROLLMENT) {
                item.setToDirection(studentDirectionCode);
            } else if (type == OrderType.TRANSFER_NEXT_COURSE) {
                item.setToDirection(studentDirectionTitle);
            } else if (type == OrderType.TRANSFER_DIRECTION) {
                item.setToDirection(firstNonBlank(request.getNewDirection(), request.getDirectionName()));
            }
        }
        if (item.getToDirectionId() == null && type == OrderType.TRANSFER_NEXT_COURSE) {
            item.setToDirectionId(studentDirectionId);
        }

        if (!hasText(item.getToGroup())) {
            if (type == OrderType.TRANSFER_NEXT_COURSE) {
                item.setToGroup(resolveNextCourseGroupCode(student, item.getToCourse()));
            } else if (type == OrderType.TRANSFER_DIRECTION) {
                item.setToGroup(firstNonBlank(request.getNewGroup(), request.getGroupCode()));
            } else if (type == OrderType.ENROLLMENT) {
                item.setToGroup(resolveEnrollmentGroupCode(student));
            } else {
                item.setToGroup(firstNonBlank(request.getNewGroup(), request.getGroupCode()));
            }
        }
        if (item.getToGroupId() == null && hasText(item.getToGroup())) {
            item.setToGroupId(resolveGroupId(item.getToGroup()));
        }

        if (item.getPeriodStart() == null) {
            LocalDate defaultPeriodStart = request.getPeriodStart();
            if (type == OrderType.ACADEMIC_LEAVE
                    || type == OrderType.TRANSFER_NEXT_COURSE
                    || type == OrderType.TRANSFER_DIRECTION
                    || type == OrderType.ENROLLMENT) {
                defaultPeriodStart = firstNonNull(request.getOrderDate(), request.getPeriodStart());
            }
            item.setPeriodStart(defaultPeriodStart);
        }
        if (item.getPeriodEnd() == null) {
            item.setPeriodEnd(request.getPeriodEnd());
        }

        if (!hasText(item.getContractInfo())) {
            item.setContractInfo(firstNonBlank(request.getContractInfo(), request.getCostInfo()));
        }

        if (!hasText(item.getBasis())) {
            if (type == OrderType.ACADEMIC_LEAVE || type == OrderType.EXPULSION) {
                item.setBasis(firstNonBlank(request.getBasis(), "заявление студента с визой декана"));
            } else if (hasText(request.getBasis())) {
                item.setBasis(request.getBasis());
            }
        }
    }

    private void validateTransferDirectionFaculty(Student student, OrderStudentItemDto item, OrderType type) {
        if (type != OrderType.TRANSFER_DIRECTION || student == null || item == null) {
            return;
        }
        if (student.getGroup() == null
                || student.getGroup().getDirection() == null
                || student.getGroup().getDirection().getFaculty() == null) {
            return;
        }

        Long sourceFacultyId = student.getGroup().getDirection().getFaculty().getId();
        if (sourceFacultyId == null) {
            return;
        }

        Long targetDirectionId = item.getToDirectionId();
        if (targetDirectionId == null && item.getToGroupId() != null) {
            targetDirectionId = groupRepository.findById(item.getToGroupId())
                    .map(StudentGroup::getDirection)
                    .map(direction -> direction.getId())
                    .orElse(null);
        }
        if (targetDirectionId == null && hasText(item.getToGroup())) {
            targetDirectionId = groupRepository.findByCode(item.getToGroup().trim())
                    .map(StudentGroup::getDirection)
                    .map(direction -> direction.getId())
                    .orElse(null);
        }
        if (targetDirectionId == null) {
            return;
        }

        Long targetFacultyId = groupRepository.findAllByDirectionId(targetDirectionId).stream()
                .map(StudentGroup::getDirection)
                .filter(Objects::nonNull)
                .map(direction -> direction.getFaculty())
                .filter(Objects::nonNull)
                .map(faculty -> faculty.getId())
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
        if (targetFacultyId == null) {
            return;
        }

        if (!Objects.equals(sourceFacultyId, targetFacultyId)) {
            throw new BusinessValidationException("Для студента " + student.getFullName()
                    + " можно выбрать направление только своего факультета.");
        }
    }

    private String buildDetailedStudentsList(OrderType type, LocalDate orderDate, List<OrderStudentItemDto> items) {
        if (items == null || items.isEmpty()) {
            return "";
        }
        return IntStream.range(0, items.size())
                .mapToObj(index -> buildStudentLine(type, orderDate, index + 1, items.get(index)))
                .collect(Collectors.joining("\n"));
    }

    private String buildStudentLine(OrderType type, LocalDate orderDate, int index, OrderStudentItemDto item) {
        String name = safe(item.getStudentName());
        String declinedName = toAccusativeFullName(name);
        String basis = safe(item.getBasis());
        String faculty = resolveFacultyDisplayName(item);
        String fromDirection = resolveDirectionDisplayName(item);
        String fromGroup = safe(item.getFromGroup());
        String toGroup = safe(item.getToGroup());
        String educationForm = safe(item.getEducationForm());
        String educationBase = safe(item.getEducationBase());
        String contractInfo = safeRaw(item.getContractInfo());

        Integer fromCourse = item.getFromCourse();
        Integer toCourse = item.getToCourse();
        boolean hasAcademicDebts = Boolean.TRUE.equals(item.getHasAcademicDebts());
        String transferCourseBasis = hasAcademicDebts
                ? "на основании завершённой сессии и решения деканата от %s."
                : "на основании завершённой сессии без академических задолженностей и решения деканата от %s.";

        return switch (type) {
            case TRANSFER_NEXT_COURSE -> String.format(
                    "%d) Перевести студента(ку) %s с %s курса на следующий %s курс, факультета %s, направления %s. " +
                            "Перевод осуществить из группы %s в группу %s " + transferCourseBasis,
                    index, declinedName, safeNum(fromCourse), safeNum(toCourse), faculty, fromDirection, fromGroup, toGroup,
                    fmt(firstNonNull(item.getPeriodStart(), orderDate))
            );
            case TRANSFER_DIRECTION -> String.format(
                    "%d) %s - студент(ка) переведён на %s курс, факультета %s, на направление %s, в группу %s " +
                            "на основании заявления студента и решения комиссии от %s.",
                    index, name, safeNum(fromCourse), faculty, resolveTargetDirectionDisplayName(item), toGroup,
                    fmt(firstNonNull(item.getPeriodStart(), orderDate))
            );
            case ACADEMIC_LEAVE -> String.format(
                    "%d) %s - студент(ка) %s курса, факультета %s, направления подготовки %s, группы %s, " +
                            "с формой обучения %s и основой обучения %s, на основании решения комиссии " +
                            "предоставляется академический отпуск с %s по %s. Основание: %s.",
                    index, name, safeNum(fromCourse), faculty, fromDirection, fromGroup, educationForm, educationBase,
                    fmt(item.getPeriodStart()), fmt(item.getPeriodEnd()), basis
            );
            case EXPULSION -> {
                LocalDate expulsionDate = firstNonNull(orderDate, item.getStudyEndDate(), item.getPeriodStart());
                LocalDate studyStartDate = resolveExpulsionStudyStartDate(item);
                String contractNo = safe(resolveExpulsionContractNumber(item));
                String paymentAmount = safe(resolveExpulsionPaymentAmount(item));
                yield String.format(
                        "%d) %s - студент(ка) %s курса, факультета %s, направления %s, группы %s, " +
                                "на основании решения комиссии и приказа от %s. Расторгнуть договор на обучение № %s. " +
                                "Образовательные услуги за период с %s по %s оказана в размере %s рублей. " +
                                "Основание: %s.",
                        index, name, safeNum(fromCourse), faculty, fromDirection, fromGroup, fmt(expulsionDate), contractNo,
                        fmt(studyStartDate), fmt(expulsionDate), paymentAmount, basis
                );
            }
            case ENROLLMENT -> {
                boolean budget = "Бюджет".equalsIgnoreCase(safeRaw(item.getEducationBase()));
                String enrollmentDirectionCode = safe(resolveEnrollmentDirectionCode(item));
                String enrolmentSpeciality = safe(ensureQuoted(resolveEnrollmentSpeciality(item)));
                String educationFormQuoted = safe(ensureQuoted(safeRaw(item.getEducationForm())));
                String paymentAmount = safe(resolveEnrollmentPaymentAmount(item));
                String paymentText = budget
                        ? "на бесплатной основе"
                        : "на платной основе в размере " + paymentAmount + " руб. в год";
                String servicesText = hasText(contractInfo) ? " " + contractInfo : "";
                yield String.format(
                        "%d) Зачислить на первый курс студента(ку) %s на %s на направление %s, " +
                                "на специальность %s в группу %s, с формой обучения %s (%s) " +
                                "на основании решения приёмной комиссии и приказа %s %s.%s",
                        index, declinedName, faculty, enrollmentDirectionCode, enrolmentSpeciality, toGroup,
                        educationFormQuoted, educationBase, fmt(firstNonNull(item.getPeriodStart(), orderDate)),
                        paymentText, servicesText
                );
            }
            default -> String.format("%d) %s. Основание: %s.", index, name, basis);
        };
    }

    private String resolveFacultyDisplayName(OrderStudentItemDto item) {
        String shortName = safeRaw(item.getFacultyShortName());
        if (hasText(shortName)) {
            return shortName.trim();
        }
        String shortNameByGroup = firstNonBlank(
                resolveFacultyShortNameByGroupId(item.getFromGroupId()),
                resolveFacultyShortNameByGroupId(item.getToGroupId())
        );
        if (hasText(shortNameByGroup)) {
            return shortNameByGroup;
        }
        String shortNameByStudent = resolveFacultyShortNameByStudentId(item.getStudentId());
        if (hasText(shortNameByStudent)) {
            return shortNameByStudent;
        }
        String fullName = safeRaw(item.getFacultyName());
        String abbreviation = buildFacultyAbbreviation(fullName);
        return safe(firstNonBlank(abbreviation, fullName));
    }

    private String resolveDirectionDisplayName(OrderStudentItemDto item) {
        String fromDirection = safeRaw(item.getFromDirection());
        if (looksLikeDirectionTitle(fromDirection)) {
            return fromDirection.trim();
        }
        String toDirection = safeRaw(item.getToDirection());
        if (looksLikeDirectionTitle(toDirection)) {
            return toDirection.trim();
        }

        String directionByGroup = firstNonBlank(
                resolveDirectionTitleByGroupId(item.getFromGroupId()),
                resolveDirectionTitleByGroupId(item.getToGroupId())
        );
        if (hasText(directionByGroup)) {
            return directionByGroup;
        }

        String directionByStudent = resolveDirectionTitleByStudentId(item.getStudentId());
        if (hasText(directionByStudent)) {
            return directionByStudent;
        }

        return safe(firstNonBlank(fromDirection, toDirection));
    }

    private String resolveTargetDirectionDisplayName(OrderStudentItemDto item) {
        String toDirection = safeRaw(item.getToDirection());
        if (looksLikeDirectionTitle(toDirection)) {
            return toDirection.trim();
        }

        String directionById = resolveDirectionTitleByDirectionId(item.getToDirectionId());
        if (hasText(directionById)) {
            return directionById;
        }

        String directionByGroup = resolveDirectionTitleByGroupId(item.getToGroupId());
        if (hasText(directionByGroup)) {
            return directionByGroup;
        }

        if (hasText(toDirection)) {
            return toDirection.trim();
        }

        return resolveDirectionDisplayName(item);
    }

    private String resolveEnrollmentDirectionCode(OrderStudentItemDto item) {
        String rawToDirection = safeRaw(item.getToDirection());
        String codeFromRaw = extractDirectionCode(rawToDirection);
        if (hasText(codeFromRaw)) {
            return codeFromRaw;
        }
        Long directionId = resolveEnrollmentDirectionId(item);
        String codeById = resolveDirectionCodeByDirectionId(directionId);
        if (hasText(codeById)) {
            return codeById;
        }
        String fromDirection = safeRaw(item.getFromDirection());
        String codeFromFromDirection = extractDirectionCode(fromDirection);
        if (hasText(codeFromFromDirection)) {
            return codeFromFromDirection;
        }
        return rawToDirection;
    }

    private String resolveEnrollmentSpeciality(OrderStudentItemDto item) {
        String speciality = safeRaw(item.getSpecialityName());
        if (hasText(speciality)) {
            return speciality;
        }
        Long directionId = resolveEnrollmentDirectionId(item);
        String directionName = resolveDirectionNameByDirectionId(directionId);
        if (hasText(directionName)) {
            return directionName;
        }
        String fromToDirection = extractQuotedText(safeRaw(item.getToDirection()));
        if (hasText(fromToDirection)) {
            return fromToDirection;
        }
        return extractQuotedText(safeRaw(item.getFromDirection()));
    }

    private String resolveEnrollmentPaymentAmount(OrderStudentItemDto item) {
        if ("Бюджет".equalsIgnoreCase(safeRaw(item.getEducationBase()))) {
            return formatMoneyAmount(BigDecimal.ZERO);
        }
        Long directionId = resolveEnrollmentDirectionId(item);
        BigDecimal byDirection = resolveDirectionTuitionByDirectionId(directionId);
        if (byDirection != null) {
            return formatMoneyAmount(byDirection);
        }
        BigDecimal fromItem = normalizeMoneyAmount(safeRaw(item.getTuitionAmount()));
        if (fromItem != null) {
            return formatMoneyAmount(fromItem);
        }
        BigDecimal fromStudentDirection = resolveDirectionTuitionByStudentId(item.getStudentId());
        return formatMoneyAmount(fromStudentDirection != null ? fromStudentDirection : BigDecimal.ZERO);
    }

    private Long resolveEnrollmentDirectionId(OrderStudentItemDto item) {
        if (item.getToDirectionId() != null) {
            return item.getToDirectionId();
        }
        if (item.getFromDirectionId() != null) {
            return item.getFromDirectionId();
        }
        if (item.getToGroupId() != null) {
            Long fromToGroup = groupRepository.findById(item.getToGroupId())
                    .map(StudentGroup::getDirection)
                    .map(direction -> direction.getId())
                    .orElse(null);
            if (fromToGroup != null) {
                return fromToGroup;
            }
        }
        if (item.getFromGroupId() != null) {
            Long fromFromGroup = groupRepository.findById(item.getFromGroupId())
                    .map(StudentGroup::getDirection)
                    .map(direction -> direction.getId())
                    .orElse(null);
            if (fromFromGroup != null) {
                return fromFromGroup;
            }
        }
        if (item.getStudentId() != null) {
            return studentRepository.findById(item.getStudentId())
                    .map(Student::getGroup)
                    .map(StudentGroup::getDirection)
                    .map(direction -> direction.getId())
                    .orElse(null);
        }
        return null;
    }

    private String resolveDirectionCodeByDirectionId(Long directionId) {
        if (directionId == null) {
            return null;
        }
        return groupRepository.findAllByDirectionId(directionId).stream()
                .map(StudentGroup::getDirection)
                .filter(Objects::nonNull)
                .map(direction -> direction.getCode())
                .filter(this::hasText)
                .map(String::trim)
                .findFirst()
                .orElse(null);
    }

    private String resolveDirectionNameByDirectionId(Long directionId) {
        if (directionId == null) {
            return null;
        }
        return groupRepository.findAllByDirectionId(directionId).stream()
                .map(StudentGroup::getDirection)
                .filter(Objects::nonNull)
                .map(direction -> direction.getName())
                .filter(this::hasText)
                .map(String::trim)
                .findFirst()
                .orElse(null);
    }

    private BigDecimal resolveDirectionTuitionByDirectionId(Long directionId) {
        if (directionId == null) {
            return null;
        }
        return groupRepository.findAllByDirectionId(directionId).stream()
                .map(StudentGroup::getDirection)
                .filter(Objects::nonNull)
                .map(direction -> direction.getAnnualTuition())
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    private String ensureQuoted(String value) {
        if (!hasText(value)) {
            return value;
        }
        String normalized = value.trim();
        if (normalized.startsWith("\"") && normalized.endsWith("\"")) {
            return normalized;
        }
        if (normalized.startsWith("«") && normalized.endsWith("»")) {
            return normalized;
        }
        normalized = normalized.replace("\"", "").trim();
        return "\"" + normalized + "\"";
    }

    private String extractDirectionCode(String value) {
        if (!hasText(value)) {
            return null;
        }
        Matcher matcher = DIRECTION_CODE_PATTERN.matcher(value.trim());
        return matcher.find() ? matcher.group(1) : null;
    }

    private String extractQuotedText(String value) {
        if (!hasText(value)) {
            return null;
        }
        String normalized = value.trim();
        int open = normalized.indexOf('"');
        int close = normalized.lastIndexOf('"');
        if (open >= 0 && close > open) {
            return normalized.substring(open + 1, close).trim();
        }
        return null;
    }

    private BigDecimal normalizeMoneyAmount(String value) {
        if (!hasText(value)) {
            return null;
        }
        String normalized = value.trim().replace('\u00A0', ' ');
        normalized = normalized.replaceAll("(?iu)\\s*руб\\.?\\s*(в\\s*год)?\\s*$", "");
        normalized = normalized.replaceAll("(?iu)\\s*рубл(ей|я|ь)?\\s*(в\\s*год)?\\s*$", "");
        normalized = normalized.replaceAll("(?iu)\\s*в\\s*год\\s*$", "");
        normalized = normalized.replaceAll("\\s+", "");
        normalized = normalized.replace(',', '.');
        normalized = normalized.replaceAll("[^0-9.]", "");
        if (!hasText(normalized)) {
            return null;
        }
        int dotIndex = normalized.indexOf('.');
        if (dotIndex >= 0) {
            normalized = normalized.substring(0, dotIndex + 1)
                    + normalized.substring(dotIndex + 1).replace(".", "");
        }
        if (normalized.startsWith(".")) {
            normalized = "0" + normalized;
        }
        try {
            return new BigDecimal(normalized).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private String formatMoneyAmount(BigDecimal amount) {
        BigDecimal safeAmount = (amount != null ? amount : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(Locale.forLanguageTag("ru-RU"));
        symbols.setGroupingSeparator(' ');
        symbols.setDecimalSeparator(',');
        DecimalFormat decimalFormat = new DecimalFormat("#,##0.00", symbols);
        decimalFormat.setGroupingUsed(true);
        decimalFormat.setMinimumFractionDigits(2);
        decimalFormat.setMaximumFractionDigits(2);
        return decimalFormat.format(safeAmount);
    }

    private String resolveExpulsionContractNumber(OrderStudentItemDto item) {
        String fromItem = safeRaw(item.getContractNumber());
        if (hasText(fromItem)) {
            return fromItem.trim();
        }
        if (item.getStudentId() == null) {
            return null;
        }
        return studentRepository.findById(item.getStudentId())
                .map(Student::getStudyContractNumber)
                .filter(this::hasText)
                .map(String::trim)
                .orElse(null);
    }

    private LocalDate resolveExpulsionStudyStartDate(OrderStudentItemDto item) {
        if (item.getStudyStartDate() != null) {
            return item.getStudyStartDate();
        }
        if (item.getStudentId() == null) {
            return null;
        }
        return studentRepository.findById(item.getStudentId())
                .map(Student::getStudyStartDate)
                .orElse(null);
    }

    private String resolveExpulsionPaymentAmount(OrderStudentItemDto item) {
        BigDecimal fromItem = normalizeMoneyAmount(safeRaw(item.getTuitionAmount()));
        if (fromItem != null) {
            return formatMoneyAmount(fromItem);
        }
        BigDecimal fromStudentDirection = resolveDirectionTuitionByStudentId(item.getStudentId());
        return formatMoneyAmount(fromStudentDirection != null ? fromStudentDirection : BigDecimal.ZERO);
    }

    private BigDecimal resolveDirectionTuitionByStudentId(Long studentId) {
        if (studentId == null) {
            return null;
        }
        return studentRepository.findById(studentId)
                .map(Student::getGroup)
                .map(StudentGroup::getDirection)
                .map(direction -> direction.getAnnualTuition())
                .filter(Objects::nonNull)
                .orElse(null);
    }

    private String resolveFacultyShortNameByGroupId(Long groupId) {
        if (groupId == null) {
            return null;
        }
        return groupRepository.findById(groupId)
                .map(group -> group.getDirection())
                .map(direction -> direction.getFaculty())
                .map(faculty -> faculty.getShortName())
                .filter(this::hasText)
                .map(String::trim)
                .orElse(null);
    }

    private String resolveFacultyShortNameByStudentId(Long studentId) {
        if (studentId == null) {
            return null;
        }
        return studentRepository.findById(studentId)
                .map(this::getStudentFacultyShortName)
                .filter(this::hasText)
                .map(String::trim)
                .orElse(null);
    }

    private String resolveDirectionTitleByGroupId(Long groupId) {
        if (groupId == null) {
            return null;
        }
        return groupRepository.findById(groupId)
                .map(group -> group.getDirection())
                .map(direction -> buildDirectionTitle(direction.getCode(), direction.getName()))
                .orElse(null);
    }

    private String resolveDirectionTitleByDirectionId(Long directionId) {
        if (directionId == null) {
            return null;
        }
        return groupRepository.findAllByDirectionId(directionId).stream()
                .map(StudentGroup::getDirection)
                .filter(Objects::nonNull)
                .findFirst()
                .map(direction -> buildDirectionTitle(direction.getCode(), direction.getName()))
                .orElse(null);
    }

    private String resolveDirectionTitleByStudentId(Long studentId) {
        if (studentId == null) {
            return null;
        }
        return studentRepository.findById(studentId)
                .map(this::getStudentDirectionTitle)
                .orElse(null);
    }

    private boolean looksLikeDirectionTitle(String value) {
        if (!hasText(value)) {
            return false;
        }
        return value.trim().matches("^\\d{2}\\.\\d{2}\\.\\d{2}(?:\\s+\".+\")?$");
    }

    private String buildFacultyAbbreviation(String fullName) {
        if (!hasText(fullName)) {
            return null;
        }
        String[] words = fullName.trim().split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (String word : words) {
            String normalized = word.toLowerCase(Locale.ROOT);
            if (FACULTY_ABBREVIATION_SKIP_WORDS.contains(normalized)) {
                continue;
            }
            char first = word.charAt(0);
            if (Character.isLetter(first)) {
                builder.append(Character.toUpperCase(first));
            }
        }
        if (builder.length() == 0) {
            return fullName.substring(0, 1).toUpperCase(Locale.ROOT);
        }
        return builder.toString();
    }

    private void applyStudentStateChanges(OrderDocument orderDocument, List<Student> students, List<OrderStudentItemDto> items) {
        if (students.isEmpty()) {
            return;
        }

        OrderType type = orderDocument.getType();
        if (type == null) {
            return;
        }

        Map<Long, OrderStudentItemDto> itemByStudentId = items.stream()
                .filter(item -> item.getStudentId() != null)
                .collect(Collectors.toMap(OrderStudentItemDto::getStudentId, item -> item, (left, right) -> left, LinkedHashMap::new));
        Map<String, StudentGroup> groupCache = new HashMap<>();

        switch (type) {
            case ACADEMIC_LEAVE -> students.forEach(student -> student.setStatus(StudentStatus.ACADEMIC_LEAVE));
            case ENROLLMENT -> students.forEach(student -> {
                OrderStudentItemDto item = itemByStudentId.get(student.getId());
                student.setStatus(StudentStatus.ACTIVE);
                StudentGroup group = resolveGroupByCode(item != null ? item.getToGroup() : null, groupCache);
                if (group != null) {
                    student.setGroup(group);
                }
                if (item != null && item.getToCourse() != null) {
                    student.setCourse(item.getToCourse());
                } else if (group != null) {
                    student.setCourse(group.getCourse());
                } else if (student.getCourse() == null || student.getCourse() < 1) {
                    student.setCourse(1);
                }
                if (item != null) {
                    if (hasText(item.getEducationForm())) {
                        student.setEducationForm(item.getEducationForm().trim());
                    }
                    if (hasText(item.getEducationBase())) {
                        student.setEducationBase(item.getEducationBase().trim());
                    }
                    if (hasText(item.getContractNumber())) {
                        student.setStudyContractNumber(item.getContractNumber().trim());
                    }
                    LocalDate startDate = firstNonNull(orderDocument.getOrderDate(), item.getStudyStartDate(), student.getStudyStartDate());
                    if (startDate != null) {
                        student.setStudyStartDate(startDate);
                    }
                } else {
                    LocalDate startDate = firstNonNull(orderDocument.getOrderDate(), student.getStudyStartDate());
                    if (startDate != null) {
                        student.setStudyStartDate(startDate);
                    }
                }
            });
            case EXPULSION -> students.forEach(student -> student.setStatus(StudentStatus.EXPELLED));
            case TRANSFER_DIRECTION -> students.forEach(student -> {
                OrderStudentItemDto item = itemByStudentId.get(student.getId());
                student.setStatus(StudentStatus.ACTIVE);
                StudentGroup group = resolveGroupByCode(item != null ? item.getToGroup() : null, groupCache);
                if (group != null) {
                    student.setGroup(group);
                }
                if (item != null && item.getToCourse() != null) {
                    student.setCourse(item.getToCourse());
                } else if (group != null) {
                    student.setCourse(group.getCourse());
                }
            });
            case TRANSFER_NEXT_COURSE -> students.forEach(student -> {
                OrderStudentItemDto item = itemByStudentId.get(student.getId());
                student.setStatus(StudentStatus.ACTIVE);
                StudentGroup group = resolveGroupByCode(item != null ? item.getToGroup() : null, groupCache);
                if (group != null) {
                    student.setGroup(group);
                }
                if (item != null && item.getToCourse() != null) {
                    student.setCourse(item.getToCourse());
                } else if (group != null) {
                    student.setCourse(group.getCourse());
                } else {
                    int currentCourse = student.getCourse() == null ? 1 : student.getCourse();
                    student.setCourse(currentCourse + 1);
                }
            });
            default -> {
                return;
            }
        }

        studentRepository.saveAll(students);
        historyService.recordOrderStateChanges(orderDocument, students);
    }

    private StudentGroup resolveGroupByCode(String groupCode, Map<String, StudentGroup> groupCache) {
        if (!hasText(groupCode)) {
            return null;
        }
        String code = groupCode.trim();
        if (groupCache.containsKey(code)) {
            return groupCache.get(code);
        }
        StudentGroup group = groupRepository.findByCode(code)
                .orElseThrow(() -> new BusinessValidationException("Группа с кодом " + code + " не найдена."));
        groupCache.put(code, group);
        return group;
    }

    private List<Long> normalizeStudentIds(List<Long> studentIds) {
        if (studentIds == null || studentIds.isEmpty()) {
            return List.of();
        }
        return studentIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private List<Student> loadStudents(List<Long> studentIds) {
        if (studentIds.isEmpty()) {
            return List.of();
        }

        List<Student> loaded = studentRepository.findAllById(studentIds);
        Map<Long, Student> studentById = new HashMap<>();
        for (Student student : loaded) {
            studentById.put(student.getId(), student);
        }

        List<Student> ordered = new ArrayList<>(studentIds.size());
        for (Long id : studentIds) {
            Student student = studentById.get(id);
            if (student == null) {
                throw new ResourceNotFoundException("Студент с id=" + id + " не найден");
            }
            ordered.add(student);
        }
        return ordered;
    }

    private String serializeStudentIds(List<Long> studentIds) {
        if (studentIds == null || studentIds.isEmpty()) {
            return null;
        }
        return studentIds.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));
    }

    private List<Long> parseStudentIds(String rawIds) {
        if (!hasText(rawIds)) {
            return List.of();
        }
        List<Long> result = new ArrayList<>();
        for (String chunk : rawIds.split(",")) {
            String value = chunk.trim();
            if (!value.isEmpty()) {
                try {
                    result.add(Long.parseLong(value));
                } catch (NumberFormatException ignored) {
                    // игнорируем некорректные значения, чтобы не ломать открытие старых записей
                }
            }
        }
        return result;
    }

    private String serializeStudentItems(List<OrderStudentItemDto> items) {
        if (items == null || items.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(items);
        } catch (JsonProcessingException e) {
            throw new BusinessValidationException("Не удалось сохранить детализацию студентов в приказе.");
        }
    }

    private List<OrderStudentItemDto> parseStudentItems(String rawJson) {
        if (!hasText(rawJson)) {
            return List.of();
        }
        try {
            List<OrderStudentItemDto> parsed = objectMapper.readValue(rawJson, STUDENT_ITEM_LIST_TYPE);
            return parsed == null ? List.of() : parsed;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private String getStudentFacultyName(Student student) {
        if (student.getGroup() == null || student.getGroup().getDirection() == null || student.getGroup().getDirection().getFaculty() == null) {
            return null;
        }
        return student.getGroup().getDirection().getFaculty().getName();
    }

    private String getStudentFacultyShortName(Student student) {
        if (student.getGroup() == null || student.getGroup().getDirection() == null || student.getGroup().getDirection().getFaculty() == null) {
            return null;
        }
        String shortName = student.getGroup().getDirection().getFaculty().getShortName();
        if (hasText(shortName)) {
            return shortName.trim();
        }
        return student.getGroup().getDirection().getFaculty().getName();
    }

    private String getStudentDirectionCode(Student student) {
        if (student.getGroup() == null || student.getGroup().getDirection() == null) {
            return null;
        }
        return student.getGroup().getDirection().getCode();
    }

    private String getStudentDirectionName(Student student) {
        if (student.getGroup() == null || student.getGroup().getDirection() == null) {
            return null;
        }
        return student.getGroup().getDirection().getName();
    }

    private String getStudentDirectionTitle(Student student) {
        String code = getStudentDirectionCode(student);
        String name = getStudentDirectionName(student);
        return buildDirectionTitle(code, name);
    }

    private String buildDirectionTitle(String code, String name) {
        if (!hasText(code) && !hasText(name)) {
            return null;
        }
        if (!hasText(code)) {
            return "\"" + name.trim() + "\"";
        }
        if (!hasText(name)) {
            return code.trim();
        }
        return code.trim() + " \"" + name.trim() + "\"";
    }

    private String resolveNextCourseGroupCode(Student student, Integer toCourse) {
        if (student.getGroup() == null || student.getGroup().getDirection() == null || toCourse == null) {
            return null;
        }
        Integer subgroupNo = extractSubgroupNo(student.getGroup().getCode());
        List<StudentGroup> groups = groupRepository.findAllByDirectionId(student.getGroup().getDirection().getId()).stream()
                .filter(group -> Objects.equals(group.getCourse(), toCourse))
                .sorted((left, right) -> String.valueOf(left.getCode()).compareToIgnoreCase(String.valueOf(right.getCode())))
                .toList();
        if (groups.isEmpty()) {
            return null;
        }
        if (subgroupNo != null) {
            for (StudentGroup candidate : groups) {
                Integer candidateSubgroup = extractSubgroupNo(candidate.getCode());
                if (Objects.equals(candidateSubgroup, subgroupNo)) {
                    return candidate.getCode();
                }
            }
        }
        return groups.get(0).getCode();
    }

    private String resolveEnrollmentGroupCode(Student student) {
        if (student.getGroup() == null || student.getGroup().getDirection() == null) {
            return null;
        }
        Integer subgroupNo = extractSubgroupNo(student.getGroup().getCode());
        List<StudentGroup> groups = groupRepository.findAllByDirectionId(student.getGroup().getDirection().getId()).stream()
                .filter(group -> Objects.equals(group.getCourse(), 1))
                .sorted((left, right) -> String.valueOf(left.getCode()).compareToIgnoreCase(String.valueOf(right.getCode())))
                .toList();
        if (groups.isEmpty()) {
            return null;
        }
        if (subgroupNo != null) {
            for (StudentGroup candidate : groups) {
                Integer candidateSubgroup = extractSubgroupNo(candidate.getCode());
                if (Objects.equals(candidateSubgroup, subgroupNo)) {
                    return candidate.getCode();
                }
            }
        }
        return groups.get(0).getCode();
    }

    private Long resolveGroupId(String code) {
        if (!hasText(code)) {
            return null;
        }
        return groupRepository.findByCode(code.trim())
                .map(StudentGroup::getId)
                .orElse(null);
    }

    private Integer extractSubgroupNo(String groupCode) {
        if (!hasText(groupCode)) {
            return null;
        }
        String normalized = groupCode.trim();
        int index = normalized.lastIndexOf('-');
        if (index < 0 || index >= normalized.length() - 1) {
            return null;
        }
        String suffix = normalized.substring(index + 1);
        if (suffix.length() < 2) {
            return null;
        }
        char last = suffix.charAt(suffix.length() - 1);
        if (!Character.isDigit(last)) {
            return null;
        }
        return Character.getNumericValue(last);
    }

    private String safe(String value) {
        return hasText(value) ? value.trim() : "___";
    }

    private String safeRaw(String value) {
        return value == null ? null : value.trim();
    }

    private String safeNum(Integer value) {
        return value == null ? "___" : String.valueOf(value);
    }

    private String fmt(LocalDate value) {
        return value == null ? "___" : value.format(DATE_FORMATTER);
    }

    private String fmtShort(LocalDate value) {
        return value == null ? "___" : value.format(DATE_SHORT_FORMATTER);
    }

    private String fmtText(LocalDate value) {
        return value == null ? "___" : value.format(DATE_TEXT_FORMATTER);
    }

    private byte[] buildOrderPdf(OrderDto order) {
        try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 56, 56, 52, 52);
            PdfWriter writer = PdfWriter.getInstance(document, outputStream);
            writer.setSpaceCharRatio(PdfWriter.NO_SPACE_CHAR_RATIO);
            document.open();

            Font headerFont = buildPdfFont(14, Font.NORMAL);
            Font headerMainFont = buildPdfFont(14, Font.BOLD);
            Font orderWordFont = buildPdfFont(15, Font.BOLD);
            Font subjectFont = buildPdfFont(14, Font.BOLD);
            Font bodyFont = buildPdfFont(14, Font.NORMAL);
            Font bodyBoldFont = buildPdfFont(14, Font.BOLD);

            addCenteredLine(document, "МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ", headerFont, 0f);
            addCenteredLine(document, "РОССИЙСКОЙ ФЕДЕРАЦИИ", headerFont, 0f);
            addCenteredLine(document, "федеральное государственное бюджетное образовательное учреждение", headerFont, 0f);
            addCenteredLine(document, "«УЛЬЯНОВСКИЙ ГОСУДАРСТВЕННЫЙ ТЕХНИЧЕСКИЙ", headerMainFont, 4f, 0f);
            addCenteredLine(document, "УНИВЕРСИТЕТ»", headerMainFont, 18f);

            addCenteredLine(document, "П Р И К А З", orderWordFont, 14f);

            PdfPTable metaTable = new PdfPTable(2);
            metaTable.setWidthPercentage(100f);
            metaTable.setWidths(new float[]{1f, 1f});
            metaTable.setSpacingAfter(12f);

            PdfPCell dateCell = new PdfPCell(new Paragraph(formatFullDateForPrint(order.getOrderDate()), bodyFont));
            dateCell.setBorder(PdfPCell.NO_BORDER);
            dateCell.setHorizontalAlignment(Element.ALIGN_LEFT);
            dateCell.setPadding(0f);
            metaTable.addCell(dateCell);

            Paragraph numberParagraph = new Paragraph("Приказ № " + safe(order.getNumber()), bodyFont);
            numberParagraph.setAlignment(Element.ALIGN_RIGHT);
            PdfPCell numberCell = new PdfPCell(numberParagraph);
            numberCell.setBorder(PdfPCell.NO_BORDER);
            numberCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
            numberCell.setPadding(0f);
            metaTable.addCell(numberCell);

            document.add(metaTable);

            Paragraph subject = new Paragraph(resolveOrderSubjectForPrint(order.getType()), subjectFont);
            subject.setAlignment(Element.ALIGN_CENTER);
            subject.setSpacingAfter(14f);
            subject.setLeading(0f, 1.2f);
            document.add(subject);

            renderOrderBodyForPdf(document, order, bodyFont, bodyBoldFont);

            LocalDate signDate = order.getSignDate() != null ? order.getSignDate() : order.getOrderDate();
            String signLabel = order.getType() == OrderType.ENROLLMENT ? "Дата подписи: " : "Дата подписи приказа: ";
            Paragraph signDateParagraph = new Paragraph(signLabel + formatDateForPrint(signDate), bodyFont);
            signDateParagraph.setAlignment(Element.ALIGN_LEFT);
            signDateParagraph.setLeading(0f, 1.2f);
            signDateParagraph.setSpacingBefore(40f);
            signDateParagraph.setSpacingAfter(12f);
            document.add(signDateParagraph);

            PdfPTable signatureTable = new PdfPTable(2);
            signatureTable.setWidthPercentage(100f);
            signatureTable.setWidths(new float[]{0.52f, 0.48f});
            signatureTable.setSpacingBefore(2f);

            Paragraph roleParagraph = new Paragraph(resolveSignerRoleForPrint(order.getType()), bodyFont);
            roleParagraph.setLeading(0f, 1.2f);
            PdfPCell roleCell = new PdfPCell(roleParagraph);
            roleCell.setBorder(PdfPCell.NO_BORDER);
            roleCell.setPadding(0f);
            roleCell.setVerticalAlignment(Element.ALIGN_BOTTOM);
            signatureTable.addCell(roleCell);

            PdfPCell lineCell = new PdfPCell(new Paragraph(" "));
            lineCell.setBorder(PdfPCell.BOTTOM);
            lineCell.setBorderWidthBottom(1f);
            lineCell.setBorderWidthTop(0f);
            lineCell.setBorderWidthLeft(0f);
            lineCell.setBorderWidthRight(0f);
            lineCell.setFixedHeight(24f);
            lineCell.setPadding(0f);
            signatureTable.addCell(lineCell);

            document.add(signatureTable);

            document.close();
            return outputStream.toByteArray();
        } catch (Exception exception) {
            throw new BusinessValidationException("Не удалось сформировать PDF приказа.");
        }
    }

    private void addCenteredLine(Document document, String text, Font font, float spacingAfter) throws DocumentException {
        addCenteredLine(document, text, font, 0f, spacingAfter);
    }

    private void addCenteredLine(Document document, String text, Font font, float spacingBefore, float spacingAfter) throws DocumentException {
        Paragraph line = new Paragraph(text, font);
        line.setAlignment(Element.ALIGN_CENTER);
        line.setLeading(0f, 1.12f);
        line.setSpacingBefore(spacingBefore);
        line.setSpacingAfter(spacingAfter);
        document.add(line);
    }

    private void addBodyParagraph(Document document, String text, Font font, float spacingAfter, boolean indent) throws DocumentException {
        if (!hasText(text)) {
            return;
        }
        Paragraph paragraph = new Paragraph(text.trim(), font);
        paragraph.setAlignment(Element.ALIGN_JUSTIFIED);
        paragraph.setLeading(0f, 1.22f);
        paragraph.setSpacingAfter(spacingAfter);
        if (indent) {
            paragraph.setFirstLineIndent(26f);
        }
        document.add(paragraph);
    }

    private void addBodyParagraphLeft(Document document, String text, Font font, float spacingAfter, boolean indent) throws DocumentException {
        if (!hasText(text)) {
            return;
        }
        Paragraph paragraph = new Paragraph(text.trim(), font);
        paragraph.setAlignment(Element.ALIGN_LEFT);
        paragraph.setLeading(0f, 1.22f);
        paragraph.setSpacingAfter(spacingAfter);
        if (indent) {
            paragraph.setFirstLineIndent(26f);
        }
        document.add(paragraph);
    }

    private void addCommandTitle(Document document, String text, Font font) throws DocumentException {
        addCommandTitle(document, text, font, 0f, 8f);
    }

    private void addCommandTitle(Document document, String text, Font font, float spacingBefore, float spacingAfter) throws DocumentException {
        Paragraph title = new Paragraph(text, font);
        title.setAlignment(Element.ALIGN_CENTER);
        title.setLeading(0f, 1.1f);
        title.setSpacingBefore(spacingBefore);
        title.setSpacingAfter(spacingAfter);
        document.add(title);
    }

    private void addCommandTitleLeft(Document document, String text, Font font) throws DocumentException {
        Paragraph title = new Paragraph(text, font);
        title.setAlignment(Element.ALIGN_LEFT);
        title.setLeading(0f, 1.1f);
        title.setSpacingAfter(8f);
        document.add(title);
    }

    private String formatFullDateForPrint(LocalDate date) {
        if (date == null) {
            return "«__» __________ ____ г.";
        }
        return String.format(
                Locale.forLanguageTag("ru-RU"),
                "«%02d» %s %d г.",
                date.getDayOfMonth(),
                monthsRu(date.getMonthValue()),
                date.getYear()
        );
    }

    private String formatDateForPrint(LocalDate date) {
        return date == null ? "___" : date.format(DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.forLanguageTag("ru-RU")));
    }

    private String monthsRu(int month) {
        return switch (month) {
            case 1 -> "января";
            case 2 -> "февраля";
            case 3 -> "марта";
            case 4 -> "апреля";
            case 5 -> "мая";
            case 6 -> "июня";
            case 7 -> "июля";
            case 8 -> "августа";
            case 9 -> "сентября";
            case 10 -> "октября";
            case 11 -> "ноября";
            case 12 -> "декабря";
            default -> "__________";
        };
    }

    private String resolveOrderSubjectForPrint(OrderType type) {
        if (type == null) {
            return "Движение контингента студентов";
        }
        return switch (type) {
            case TRANSFER_NEXT_COURSE -> "Движение контингента студентов. Перевод студентов на следующий\nкурс.";
            case TRANSFER_DIRECTION -> "Движение контингента студентов. Перевод студентов на другое\nнаправление";
            case ACADEMIC_LEAVE -> "Движение контингента студентов. О предоставлении академического\nотпуска студентам";
            case EXPULSION -> "Движение контингента студентов. Об отчислении студентов";
            case ENROLLMENT -> "Движение контингента студентов. О зачислении студентов на\nобучение на первый курс";
        };
    }

    private String resolveSignerRoleForPrint(OrderType type) {
        if (type == null) {
            return "Подписант";
        }
        return switch (type) {
            case TRANSFER_NEXT_COURSE, TRANSFER_DIRECTION -> "Проректор УлГТУ\nпо работе с контингентом студентов";
            case ACADEMIC_LEAVE -> "Проректор УлГТУ";
            case EXPULSION -> "Ректор УлГТУ";
            case ENROLLMENT -> "Проректор по учебной работе УлГТУ";
        };
    }

    private void renderOrderBodyForPdf(Document document, OrderDto order, Font bodyFont, Font bodyBoldFont) throws DocumentException {
        String listText = toNumberedListForPrint(order.getStudentsList());
        OrderType type = order.getType();

        if (type == OrderType.TRANSFER_NEXT_COURSE) {
            addBodyParagraph(document,
                    "В связи с успешным завершением промежуточной аттестации и отсутствием академических задолженностей по результатам учебного семестра, в соответствии с Положением об организации образовательного процесса и о текущем контроле успеваемости промежуточной аттестации обучающихся студентов в УлГТУ, утверждёнными приказом ректора.",
                    bodyFont, 6f, true);
            addCommandTitle(document, "ПРИКАЗЫВАЮ:", bodyBoldFont);
            addBodyParagraph(document,
                    "Признать успешно завершившими промежуточную аттестацию и перевести следующих студентов на следующий курс учебного года в соответствии с приведённым ниже списком:",
                    bodyFont, 6f, true);
            renderStudentItemsForPrint(document, listText, bodyFont);
            return;
        }

        if (type == OrderType.TRANSFER_DIRECTION) {
            addBodyParagraph(document,
                    "На основании заявления студента и в соответствии с положением и регламентом УлГТУ об образовании.",
                    bodyFont, 6f, true);
            addCommandTitle(document, "ПРИКАЗЫВАЮ:", bodyBoldFont);
            addBodyParagraph(document,
                    "Перевести следующих студентов по их собственному желанию на другое направление и другую группу в соответствии с приведённым списком:",
                    bodyFont, 6f, true);
            renderStudentItemsForPrint(document, listText, bodyFont);
            return;
        }

        if (type == OrderType.ACADEMIC_LEAVE) {
            addBodyParagraph(document,
                    "В соответствии с российским законодательством на основании Федерального закона \"Об образовании в Российской Федерации\", Положения и регламенте о порядке предоставления академических отпусков в УлГТУ.",
                    bodyFont, 6f, true);
            addCommandTitleLeft(document, "ПРИКАЗЫВАЮ:", bodyBoldFont);
            addBodyParagraph(document,
                    "Предоставить академический отпуск следующим студентам в связи с личными (семейными) обстоятельствами, либо связанные с состоянием здоровья в соответствии с приведённым списком:",
                    bodyFont, 6f, true);
            renderStudentItemsForPrint(document, listText, bodyFont);
            return;
        }

        if (type == OrderType.EXPULSION) {
            addBodyParagraph(document,
                    "На основании устава Ульяновского государственного технического университета и в соответствии с законодательством Российской Федерации.",
                    bodyFont, 6f, true);
            addCommandTitle(document, "ПРИКАЗЫВАЮ:", bodyBoldFont, 10f, 12f);
            if (order.getExpelDate() != null) {
                addBodyParagraph(document,
                        "Считать отчисленными с " + formatDateForPrint(order.getExpelDate()) + " по собственному желанию студентов в соответствии с приведённым списком:",
                        bodyFont, 6f, true);
            } else {
                addBodyParagraph(document,
                        "Считать отчисленными по собственному желанию студентов в соответствии с приведённым списком:",
                        bodyFont, 6f, true);
            }
            renderStudentItemsForPrint(document, listText, bodyFont);
            if (hasText(order.getContractInfo())) {
                addBodyParagraph(document, order.getContractInfo(), bodyFont, 6f, true);
            }
            addBodyParagraph(document, "Основание: " + (hasText(order.getBasis()) ? order.getBasis() : "заявление студента с визой декана") + ".", bodyFont, 6f, true);
            return;
        }

        if (type == OrderType.ENROLLMENT) {
            addBodyParagraph(document,
                    "На основании Правил приёма в Ульяновский государственный технический университет и решения приёмной комиссии в соответствии с законодательством.",
                    bodyFont, 6f, true);
            addCommandTitleLeft(document, "ПРИКАЗЫВАЮ:", bodyBoldFont);
            renderStudentItemsForPrint(document, listText, bodyFont);
            return;
        }

        addBodyParagraph(document, hasText(order.getText()) ? order.getText().trim() : "Текст приказа отсутствует.", bodyFont, 6f, true);
        renderStudentItemsForPrint(document, listText, bodyFont);
    }

    private void renderStudentItemsForPrint(Document document, String text, Font bodyFont) throws DocumentException {
        List<String> items = splitNumberedListForPrint(text);
        if (items.isEmpty()) {
            addBodyParagraph(document, "1) ____________________________________________", bodyFont, 4f, true);
            return;
        }

        for (String item : items) {
            if (!hasText(item)) {
                continue;
            }
            String normalized = item.replace("студент(ку)", "студент(ка)").trim();
            int basisIndex = normalized.indexOf(" Основание:");
            if (basisIndex > 0) {
                String mainLine = normalized.substring(0, basisIndex).trim();
                String basisLine = normalized.substring(basisIndex + 1).trim();
                addBodyParagraph(document, mainLine, bodyFont, 4f, true);
                addBodyParagraph(document, basisLine, bodyFont, 6f, true);
            } else {
                addBodyParagraph(document, normalized, bodyFont, 4f, true);
            }
        }
    }

    private String toNumberedListForPrint(String text) {
        String raw = safeRaw(text);
        if (!hasText(raw)) {
            return "1) ____________________________________________";
        }
        String normalized = raw.trim();
        if (normalized.matches("(?s)^\\d+\\)\\s+.*$")) {
            return normalized;
        }
        List<String> parts = Arrays.stream(normalized.split(","))
                .map(String::trim)
                .filter(this::hasText)
                .toList();
        if (parts.size() <= 1) {
            return normalized;
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) {
                builder.append('\n');
            }
            builder.append(i + 1).append(") ").append(parts.get(i));
        }
        return builder.toString();
    }

    private List<String> splitNumberedListForPrint(String text) {
        String normalized = safeRaw(text);
        if (!hasText(normalized)) {
            return List.of();
        }
        normalized = normalized.replace("\r", "\n").trim();
        Pattern numberedItemPattern = Pattern.compile("\\d+\\)\\s[\\s\\S]*?(?=(?:\\n\\d+\\)\\s)|$)");
        Matcher matcher = numberedItemPattern.matcher(normalized);
        List<String> items = new ArrayList<>();
        while (matcher.find()) {
            String item = matcher.group().trim();
            if (hasText(item)) {
                items.add(item);
            }
        }
        if (!items.isEmpty()) {
            return items;
        }
        return Arrays.stream(normalized.split("\\n+"))
                .map(String::trim)
                .filter(this::hasText)
                .toList();
    }

    private Font buildPdfFont(float size, int style) {
        BaseFont baseFont = resolvePdfBaseFont();
        if (baseFont != null) {
            return new Font(baseFont, size, style);
        }
        return FontFactory.getFont(FontFactory.HELVETICA, "Cp1251", size, style);
    }

    private BaseFont resolvePdfBaseFont() {
        List<String> candidates = Arrays.asList(
                "C:/Windows/Fonts/times.ttf",
                "C:/Windows/Fonts/timesnewroman.ttf",
                "C:/Windows/Fonts/arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
        );
        for (String path : candidates) {
            try {
                File fontFile = new File(path);
                if (!fontFile.exists()) {
                    continue;
                }
                return BaseFont.createFont(path, BaseFont.IDENTITY_H, BaseFont.EMBEDDED);
            } catch (Exception ignored) {
                // fallback candidate
            }
        }
        try {
            return BaseFont.createFont(BaseFont.HELVETICA, "Cp1251", BaseFont.NOT_EMBEDDED);
        } catch (DocumentException | java.io.IOException ignored) {
            return null;
        }
    }

    private String toAccusativeFullName(String fullName) {
        if (!hasText(fullName)) {
            return "___";
        }
        String normalized = fullName.trim().replaceAll("\\s+", " ");
        if ("___".equals(normalized)) {
            return normalized;
        }
        String[] parts = normalized.split(" ");
        if (parts.length < 2) {
            return normalized;
        }

        String lastName = parts[0];
        String firstName = parts[1];
        String middleName = parts.length > 2 ? parts[2] : null;

        Gender gender = detectGender(firstName, middleName);
        String declinedLastName = declineLastNameToAccusative(lastName, gender);
        String declinedFirstName = declineFirstNameToAccusative(firstName, gender);
        String declinedMiddleName = middleName != null ? declineMiddleNameToAccusative(middleName, gender) : null;

        StringBuilder result = new StringBuilder();
        result.append(declinedLastName).append(" ").append(declinedFirstName);
        if (declinedMiddleName != null) {
            result.append(" ").append(declinedMiddleName);
        }
        if (parts.length > 3) {
            for (int i = 3; i < parts.length; i++) {
                result.append(" ").append(parts[i]);
            }
        }
        return result.toString();
    }

    private Gender detectGender(String firstName, String middleName) {
        String middle = hasText(middleName) ? middleName.trim().toLowerCase(Locale.ROOT) : "";
        if (middle.endsWith("ич")) {
            return Gender.MALE;
        }
        if (middle.endsWith("на")) {
            return Gender.FEMALE;
        }

        String first = hasText(firstName) ? firstName.trim().toLowerCase(Locale.ROOT) : "";
        if (first.endsWith("а") || first.endsWith("я")) {
            return Gender.FEMALE;
        }
        if (hasText(first)) {
            return Gender.MALE;
        }
        return Gender.UNKNOWN;
    }

    private String declineLastNameToAccusative(String value, Gender gender) {
        if (!hasText(value) || value.contains(".")) {
            return value;
        }

        String lower = value.toLowerCase(Locale.ROOT);
        if (gender == Gender.FEMALE) {
            if (lower.endsWith("ая")) {
                return replaceEnding(value, 2, "ую");
            }
            if (lower.endsWith("яя")) {
                return replaceEnding(value, 2, "юю");
            }
            if (lower.endsWith("а")) {
                return replaceEnding(value, 1, "у");
            }
            if (lower.endsWith("я")) {
                return replaceEnding(value, 1, "ю");
            }
            return value;
        }

        if (gender == Gender.MALE) {
            if (lower.endsWith("ский") || lower.endsWith("цкий")) {
                return replaceEnding(value, 2, "ого");
            }
            if (lower.endsWith("ой") || lower.endsWith("ый")) {
                return replaceEnding(value, 2, "ого");
            }
            if (lower.endsWith("ий")) {
                return replaceEnding(value, 2, "его");
            }
            if (lower.endsWith("ец")) {
                return replaceEnding(value, 2, "ца");
            }
            if (lower.endsWith("ь") || lower.endsWith("й")) {
                return replaceEnding(value, 1, "я");
            }
            if (lower.endsWith("а")) {
                return replaceEnding(value, 1, "у");
            }
            if (lower.endsWith("я")) {
                return replaceEnding(value, 1, "ю");
            }
            if (endsWithConsonant(lower)) {
                return value + "а";
            }
        }

        return value;
    }

    private String declineFirstNameToAccusative(String value, Gender gender) {
        if (!hasText(value) || value.contains(".")) {
            return value;
        }

        String lower = value.toLowerCase(Locale.ROOT);
        if (gender == Gender.FEMALE) {
            if (lower.endsWith("ия")) {
                return replaceEnding(value, 2, "ию");
            }
            if (lower.endsWith("ья")) {
                return replaceEnding(value, 2, "ью");
            }
            if (lower.endsWith("а")) {
                return replaceEnding(value, 1, "у");
            }
            if (lower.endsWith("я")) {
                return replaceEnding(value, 1, "ю");
            }
            return value;
        }

        if (gender == Gender.MALE) {
            if (lower.endsWith("ий")) {
                return replaceEnding(value, 2, "ия");
            }
            if (lower.endsWith("й") || lower.endsWith("ь")) {
                return replaceEnding(value, 1, "я");
            }
            if (lower.endsWith("а")) {
                return replaceEnding(value, 1, "у");
            }
            if (lower.endsWith("я")) {
                return replaceEnding(value, 1, "ю");
            }
            if (endsWithConsonant(lower)) {
                return value + "а";
            }
        }

        return value;
    }

    private String declineMiddleNameToAccusative(String value, Gender gender) {
        if (!hasText(value) || value.contains(".")) {
            return value;
        }

        String lower = value.toLowerCase(Locale.ROOT);
        if (gender == Gender.FEMALE) {
            if (lower.endsWith("на")) {
                return replaceEnding(value, 1, "у");
            }
            if (lower.endsWith("а")) {
                return replaceEnding(value, 1, "у");
            }
            if (lower.endsWith("я")) {
                return replaceEnding(value, 1, "ю");
            }
            return value;
        }

        if (gender == Gender.MALE) {
            if (lower.endsWith("ич")) {
                return value + "а";
            }
            if (lower.endsWith("й") || lower.endsWith("ь")) {
                return replaceEnding(value, 1, "я");
            }
            if (endsWithConsonant(lower)) {
                return value + "а";
            }
        }

        return value;
    }

    private String replaceEnding(String value, int charsToReplace, String replacement) {
        if (value.length() <= charsToReplace) {
            return replacement;
        }
        return value.substring(0, value.length() - charsToReplace) + replacement;
    }

    private boolean endsWithConsonant(String value) {
        if (!hasText(value)) {
            return false;
        }
        char last = value.charAt(value.length() - 1);
        return (last >= 'а' && last <= 'я') && "аеёиоуыэюя".indexOf(last) < 0;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private LocalDate firstNonNull(LocalDate... values) {
        if (values == null) {
            return null;
        }
        for (LocalDate value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static class StudentExecutionSnapshot {
        private Long studentId;
        private StudentStatus status;
        private Integer course;
        private Long groupId;

        public StudentExecutionSnapshot() {
        }

        public StudentExecutionSnapshot(Long studentId, StudentStatus status, Integer course, Long groupId) {
            this.studentId = studentId;
            this.status = status;
            this.course = course;
            this.groupId = groupId;
        }

        public Long getStudentId() {
            return studentId;
        }

        public void setStudentId(Long studentId) {
            this.studentId = studentId;
        }

        public StudentStatus getStatus() {
            return status;
        }

        public void setStatus(StudentStatus status) {
            this.status = status;
        }

        public Integer getCourse() {
            return course;
        }

        public void setCourse(Integer course) {
            this.course = course;
        }

        public Long getGroupId() {
            return groupId;
        }

        public void setGroupId(Long groupId) {
            this.groupId = groupId;
        }
    }

    private enum Gender {
        MALE,
        FEMALE,
        UNKNOWN
    }

    private OrderDto toDto(OrderDocument document) {
        List<Long> parsedStudentIds = parseStudentIds(document.getStudentIds());
        List<OrderStudentItemDto> parsedStudentItems = parseStudentItems(document.getStudentItemsJson());
        List<OrderStudentItemDto> effectiveStudentItems = parsedStudentItems;
        List<Student> studentsForRender = parsedStudentIds.isEmpty() ? List.of() : loadStudentsForRender(parsedStudentIds);
        boolean signed = Boolean.TRUE.equals(document.getSigned());
        if (!signed && !studentsForRender.isEmpty()) {
            OrderRequest requestForRender = toRequestForRender(document);
            requestForRender.setStudentItems(parsedStudentItems);
            effectiveStudentItems = resolveStudentItems(requestForRender, studentsForRender);
        }

        String effectiveStudentsList = document.getStudentsList();
        if (!effectiveStudentItems.isEmpty()) {
            effectiveStudentsList = buildDetailedStudentsList(document.getType(), document.getOrderDate(), effectiveStudentItems);
        } else if (hasText(effectiveStudentsList)) {
            effectiveStudentsList = declineStudentsInText(effectiveStudentsList);
        }

        return OrderDto.builder()
                .id(document.getId())
                .number(document.getNumber())
                .orderDate(document.getOrderDate())
                .type(document.getType())
                .text(document.getText())
                .signDate(document.getSignDate())
                .signerPosition(document.getSignerPosition())
                .signerName(document.getSignerName())
                .studentsList(effectiveStudentsList)
                .studentIds(parsedStudentIds)
                .studentItems(effectiveStudentItems)
                .executed(Boolean.TRUE.equals(document.getExecuted()))
                .executedAt(document.getExecutedAt())
                .signed(signed)
                .signedAt(document.getSignedAt())
                .periodStart(document.getPeriodStart())
                .periodEnd(document.getPeriodEnd())
                .basis(document.getBasis())
                .directionName(document.getDirectionName())
                .groupCode(document.getGroupCode())
                .educationForm(document.getEducationForm())
                .educationBase(document.getEducationBase())
                .costInfo(document.getCostInfo())
                .expelDate(document.getExpelDate())
                .contractInfo(document.getContractInfo())
                .oldDirection(document.getOldDirection())
                .oldGroup(document.getOldGroup())
                .newDirection(document.getNewDirection())
                .newGroup(document.getNewGroup())
                .previousCourse(document.getPreviousCourse())
                .nextCourse(document.getNextCourse())
                .build();
    }

    private List<Student> loadStudentsForRender(List<Long> studentIds) {
        if (studentIds == null || studentIds.isEmpty()) {
            return List.of();
        }
        List<Student> loaded = studentRepository.findAllById(studentIds);
        Map<Long, Student> byId = new HashMap<>();
        for (Student student : loaded) {
            byId.put(student.getId(), student);
        }
        return studentIds.stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .toList();
    }

    private OrderRequest toRequestForRender(OrderDocument document) {
        OrderRequest request = new OrderRequest();
        request.setType(document.getType());
        request.setOrderDate(document.getOrderDate());
        request.setBasis(document.getBasis());
        request.setPeriodStart(document.getPeriodStart());
        request.setPeriodEnd(document.getPeriodEnd());
        request.setDirectionName(document.getDirectionName());
        request.setGroupCode(document.getGroupCode());
        request.setEducationForm(document.getEducationForm());
        request.setEducationBase(document.getEducationBase());
        request.setCostInfo(document.getCostInfo());
        request.setContractInfo(document.getContractInfo());
        request.setNewDirection(document.getNewDirection());
        request.setNewGroup(document.getNewGroup());
        request.setPreviousCourse(document.getPreviousCourse());
        request.setNextCourse(document.getNextCourse());
        return request;
    }

    private String declineStudentsInText(String text) {
        if (!hasText(text)) {
            return text;
        }
        Matcher matcher = STUDENT_ACCUSATIVE_PATTERN.matcher(text);
        StringBuffer buffer = new StringBuffer();
        boolean changed = false;
        while (matcher.find()) {
            String declined = toAccusativeFullName(matcher.group(2));
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(matcher.group(1) + declined));
            changed = true;
        }
        if (!changed) {
            return text;
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }
}
