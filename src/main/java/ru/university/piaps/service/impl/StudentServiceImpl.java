package ru.university.piaps.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.StudentDto;
import ru.university.piaps.dto.OrderStudentItemDto;
import ru.university.piaps.dto.StudentPageResponse;
import ru.university.piaps.dto.StudentRequest;
import ru.university.piaps.dto.StudentSearchCriteria;
import ru.university.piaps.exception.BusinessValidationException;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.OrderDocument;
import ru.university.piaps.model.Student;
import ru.university.piaps.model.StudentGroup;
import ru.university.piaps.model.StudentStatus;
import ru.university.piaps.repository.OrderDocumentRepository;
import ru.university.piaps.repository.StudentGroupRepository;
import ru.university.piaps.repository.StudentRepository;
import ru.university.piaps.repository.StudentStateHistoryRepository;
import ru.university.piaps.service.StudentService;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class StudentServiceImpl implements StudentService {

    private static final TypeReference<List<OrderStudentItemDto>> ORDER_STUDENT_ITEM_LIST_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<ExecutionSnapshotItem>> EXECUTION_SNAPSHOT_LIST_TYPE = new TypeReference<>() {
    };
    private static final Pattern STUDENT_NAME_ALLOWED_PATTERN = Pattern.compile("^[A-Za-zА-Яа-яЁё\\-]+$");
    private static final String DUPLICATE_STUDENT_DOC_MESSAGE = "Студент с таким номером зачётки или договора существует.";

    private final StudentRepository studentRepository;
    private final StudentGroupRepository groupRepository;
    private final StudentStateHistoryService historyService;
    private final StudentStateHistoryRepository historyRepository;
    private final OrderDocumentRepository orderRepository;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public List<StudentDto> findStudents(StudentSearchCriteria criteria) {
        StudentSearchCriteria safeCriteria = criteria == null ? StudentSearchCriteria.builder().build() : criteria;
        Specification<Student> spec = StudentSpecifications.fromCriteria(safeCriteria);
        return studentRepository.findAll(spec).stream()
                .map(this::toDto)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public StudentPageResponse findStudentsPage(StudentSearchCriteria criteria, int page, int size, String sortBy, String sortDirection) {
        StudentSearchCriteria safeCriteria = criteria == null ? StudentSearchCriteria.builder().build() : criteria;
        Specification<Student> spec = StudentSpecifications.fromCriteria(safeCriteria);
        PageRequest pageRequest = PageRequest.of(page, size, buildSort(sortBy, sortDirection));
        Page<Student> result = studentRepository.findAll(spec, pageRequest);
        List<StudentDto> content = result.getContent().stream().map(this::toDto).toList();
        return StudentPageResponse.builder()
                .content(content)
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .page(result.getNumber())
                .size(result.getSize())
                .build();
    }

    private Sort buildSort(String sortBy, String sortDirection) {
        String mode = sortBy == null ? "" : sortBy.trim().toLowerCase();
        Sort.Direction direction = "desc".equalsIgnoreCase(sortDirection) ? Sort.Direction.DESC : Sort.Direction.ASC;
        return switch (mode) {
            case "id" -> Sort.by(
                    new Sort.Order(direction, "id")
            );
            case "admissiondate" -> Sort.by(
                    new Sort.Order(direction, "studyStartDate"),
                    new Sort.Order(Sort.Direction.DESC, "id")
            );
            case "faculty" -> Sort.by(
                    new Sort.Order(direction, "group.direction.faculty.name").ignoreCase(),
                    new Sort.Order(direction, "lastName").ignoreCase(),
                    new Sort.Order(direction, "firstName").ignoreCase(),
                    new Sort.Order(direction, "middleName").ignoreCase()
            );
            case "direction" -> Sort.by(
                    new Sort.Order(direction, "group.direction.name").ignoreCase(),
                    new Sort.Order(direction, "lastName").ignoreCase(),
                    new Sort.Order(direction, "firstName").ignoreCase(),
                    new Sort.Order(direction, "middleName").ignoreCase()
            );
            case "group" -> Sort.by(
                    new Sort.Order(direction, "group.code").ignoreCase(),
                    new Sort.Order(direction, "lastName").ignoreCase(),
                    new Sort.Order(direction, "firstName").ignoreCase(),
                    new Sort.Order(direction, "middleName").ignoreCase()
            );
            case "course" -> Sort.by(
                    new Sort.Order(direction, "course"),
                    new Sort.Order(direction, "lastName").ignoreCase(),
                    new Sort.Order(direction, "firstName").ignoreCase(),
                    new Sort.Order(direction, "middleName").ignoreCase()
            );
            case "status" -> Sort.by(
                    new Sort.Order(direction, "status"),
                    new Sort.Order(direction, "lastName").ignoreCase(),
                    new Sort.Order(direction, "firstName").ignoreCase(),
                    new Sort.Order(direction, "middleName").ignoreCase()
            );
            default -> Sort.by(
                    new Sort.Order(Sort.Direction.DESC, "id")
            );
        };
    }

    @Override
    @Transactional(readOnly = true)
    public StudentDto findById(Long id) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Студент не найден"));
        return toDto(student);
    }

    @Override
    @Transactional
    public StudentDto create(StudentRequest request) {
        StudentGroup group = groupRepository.findById(request.getGroupId())
                .orElseThrow(() -> new ResourceNotFoundException("Группа не найдена"));
        String lastName = normalizeAndValidateStudentName(request.getLastName(), "Фамилия", true);
        String firstName = normalizeAndValidateStudentName(request.getFirstName(), "Имя", true);
        String middleName = normalizeAndValidateStudentName(request.getMiddleName(), "Отчество", false);
        String recordBook = normalizeRecordBook(request.getRecordBook());
        String educationForm = normalizeEducationForm(request.getEducationForm());
        String educationBase = normalizeEducationBase(request.getEducationBase());
        String contractNumber = normalizeContractNumber(request.getStudyContractNumber());
        LocalDate admissionDate = resolveAdmissionDate(request.getStudyStartDate(), request.getStatus());
        ensureRecordBookMatchesStudyStartDate(recordBook, admissionDate);
        ensureContractNumberMatchesStudyStartDate(contractNumber, admissionDate);
        ensureRecordBookUnique(recordBook, null);
        ensureContractNumberUnique(contractNumber, null);
        String phone = normalizePhone(request.getPhone());
        String email = trimToNull(request.getEmail());
        Student student = Student.builder()
                .firstName(firstName)
                .lastName(lastName)
                .middleName(middleName)
                .recordBook(recordBook)
                .course(request.getCourse())
                .status(request.getStatus())
                .birthDate(request.getBirthDate())
                .phone(phone)
                .email(email)
                .educationForm(educationForm)
                .educationBase(educationBase)
                .hasAcademicDebts(Boolean.TRUE.equals(request.getHasAcademicDebts()))
                .studyContractNumber(contractNumber)
                .studyStartDate(admissionDate)
                .group(group)
                .build();
        Student saved = studentRepository.save(student);
        historyService.recordStudentState(saved, admissionDate);
        return toDto(saved);
    }

    @Override
    @Transactional
    public StudentDto update(Long id, StudentRequest request) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Студент не найден"));
        StudentGroup group = groupRepository.findById(request.getGroupId())
                .orElseThrow(() -> new ResourceNotFoundException("Группа не найдена"));

        student.setFirstName(normalizeAndValidateStudentName(request.getFirstName(), "Имя", true));
        student.setLastName(normalizeAndValidateStudentName(request.getLastName(), "Фамилия", true));
        student.setMiddleName(normalizeAndValidateStudentName(request.getMiddleName(), "Отчество", false));
        student.setCourse(request.getCourse());
        student.setStatus(request.getStatus());
        student.setBirthDate(request.getBirthDate());
        student.setPhone(normalizePhone(request.getPhone()));
        student.setEmail(trimToNull(request.getEmail()));
        LocalDate admissionDate = resolveAdmissionDate(request.getStudyStartDate(), request.getStatus());
        String recordBook = normalizeRecordBook(request.getRecordBook());
        ensureRecordBookMatchesStudyStartDate(recordBook, admissionDate);
        String currentRecordBookYear = studyYearTwoDigits(student.getStudyStartDate());
        String currentRecordBookSuffix = normalizeRecordBookSuffix(student.getRecordBook());
        String requestedRecordBookYear = recordBookYearPart(recordBook);
        String requestedRecordBookSuffix = recordBookSuffixPart(recordBook);
        boolean recordBookChanged = !requestedRecordBookYear.equals(currentRecordBookYear)
                || !requestedRecordBookSuffix.equals(currentRecordBookSuffix);
        if (recordBookChanged) {
            ensureRecordBookUnique(recordBook, id);
        }
        student.setRecordBook(recordBook);
        student.setEducationForm(normalizeEducationForm(request.getEducationForm()));
        student.setEducationBase(normalizeEducationBase(request.getEducationBase()));
        student.setHasAcademicDebts(Boolean.TRUE.equals(request.getHasAcademicDebts()));
        String contractNumber = normalizeContractNumber(request.getStudyContractNumber());
        ensureContractNumberMatchesStudyStartDate(contractNumber, admissionDate);
        String currentContractYear = studyYearFourDigits(student.getStudyStartDate());
        String currentContractSuffix = normalizeContractSuffix(student.getStudyContractNumber());
        String requestedContractYear = contractYearPart(contractNumber);
        String requestedContractSuffix = contractSuffixPart(contractNumber);
        boolean contractNumberChanged = !requestedContractYear.equals(currentContractYear)
                || !requestedContractSuffix.equals(currentContractSuffix);
        if (contractNumberChanged) {
            ensureContractNumberUnique(contractNumber, id);
        }
        student.setStudyContractNumber(contractNumber);
        student.setStudyStartDate(admissionDate);
        student.setGroup(group);
        Student saved = studentRepository.save(student);
        historyService.recordStudentState(saved, LocalDate.now());
        return toDto(saved);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!studentRepository.existsById(id)) {
            throw new ResourceNotFoundException("Студент не найден");
        }
        cleanupStudentInUnsignedOrders(id);
        historyRepository.deleteAllByStudentId(id);
        studentRepository.deleteById(id);
    }

    private void cleanupStudentInUnsignedOrders(Long studentId) {
        List<OrderDocument> unsignedOrders = orderRepository.findAllUnsigned();
        if (unsignedOrders.isEmpty()) {
            return;
        }
        List<OrderDocument> changedOrders = new ArrayList<>();
        for (OrderDocument order : unsignedOrders) {
            boolean changed = false;

            List<Long> ids = parseStudentIds(order.getStudentIds());
            if (ids.removeIf(id -> Objects.equals(id, studentId))) {
                order.setStudentIds(joinStudentIds(ids));
                changed = true;
            }

            List<OrderStudentItemDto> items = parseStudentItems(order.getStudentItemsJson());
            if (items.removeIf(item -> item != null && Objects.equals(item.getStudentId(), studentId))) {
                order.setStudentItemsJson(writeStudentItems(items));
                order.setStudentsList(buildStudentsList(items));
                changed = true;
            }

            String updatedSnapshotJson = removeStudentFromExecutionSnapshot(order.getExecutionSnapshotJson(), studentId);
            if (!Objects.equals(updatedSnapshotJson, order.getExecutionSnapshotJson())) {
                order.setExecutionSnapshotJson(updatedSnapshotJson);
                changed = true;
            }

            if (changed) {
                changedOrders.add(order);
            }
        }
        if (!changedOrders.isEmpty()) {
            orderRepository.saveAll(changedOrders);
        }
    }

    private StudentDto toDto(Student student) {
        StudentGroup group = student.getGroup();
        String directionName = group != null && group.getDirection() != null ? group.getDirection().getName() : null;
        String directionCode = group != null && group.getDirection() != null ? group.getDirection().getCode() : null;
        Long directionId = group != null && group.getDirection() != null ? group.getDirection().getId() : null;
        String facultyName = null;
        String facultyShortName = null;
        Long facultyId = null;
        if (group != null && group.getDirection() != null && group.getDirection().getFaculty() != null) {
            facultyName = group.getDirection().getFaculty().getName();
            facultyShortName = group.getDirection().getFaculty().getShortName();
            facultyId = group.getDirection().getFaculty().getId();
        }
        return StudentDto.builder()
                .id(student.getId())
                .lastName(student.getLastName())
                .firstName(student.getFirstName())
                .middleName(student.getMiddleName())
                .fullName(student.getFullName())
                .recordBook(student.getRecordBook())
                .course(student.getCourse())
                .status(student.getStatus())
                .groupId(group != null ? group.getId() : null)
                .groupCode(group != null ? group.getCode() : null)
                .directionId(directionId)
                .directionCode(directionCode)
                .directionName(directionName)
                .facultyId(facultyId)
                .facultyName(facultyName)
                .facultyShortName(facultyShortName)
                .educationForm(student.getEducationForm())
                .educationBase(student.getEducationBase())
                .hasAcademicDebts(Boolean.TRUE.equals(student.getHasAcademicDebts()))
                .studyContractNumber(student.getStudyContractNumber())
                .studyStartDate(student.getStudyStartDate())
                .phone(student.getPhone())
                .email(student.getEmail())
                .birthDate(student.getBirthDate())
                .build();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizeAndValidateStudentName(String value, String fieldLabel, boolean required) {
        String normalized = normalizeName(value);
        if (normalized == null || normalized.isBlank()) {
            if (required) {
                throw new BusinessValidationException(getRequiredNameMessage(fieldLabel));
            }
            return null;
        }
        if (normalized.length() < 2 || normalized.length() > 40) {
            throw new BusinessValidationException(getLengthNameMessage(fieldLabel));
        }
        if (!STUDENT_NAME_ALLOWED_PATTERN.matcher(normalized).matches()) {
            throw new BusinessValidationException(getInvalidNameMessage(fieldLabel));
        }
        if (isRepeatingSingleSymbol(normalized)) {
            throw new BusinessValidationException(getInvalidNameMessage(fieldLabel));
        }
        return normalized;
    }

    private String getRequiredNameMessage(String fieldLabel) {
        return switch (fieldLabel) {
            case "Фамилия" -> "Укажите фамилию.";
            case "Имя" -> "Укажите имя.";
            case "Отчество" -> "Укажите отчество.";
            default -> "Укажите корректное значение.";
        };
    }

    private String getLengthNameMessage(String fieldLabel) {
        return switch (fieldLabel) {
            case "Фамилия" -> "Фамилия должна быть длиной от 2 до 40 символов.";
            case "Имя" -> "Имя должно быть длиной от 2 до 40 символов.";
            case "Отчество" -> "Отчество должно быть длиной от 2 до 40 символов.";
            default -> "Значение должно быть длиной от 2 до 40 символов.";
        };
    }

    private String getInvalidNameMessage(String fieldLabel) {
        return switch (fieldLabel) {
            case "Фамилия" -> "Фамилия выглядит некорректно.";
            case "Имя" -> "Имя выглядит некорректно.";
            case "Отчество" -> "Отчество выглядит некорректно.";
            default -> "Значение выглядит некорректно.";
        };
    }

    private String normalizeName(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private boolean isRepeatingSingleSymbol(String value) {
        if (value == null) {
            return false;
        }
        String compact = value.replaceAll("\\s+", "").toLowerCase();
        if (compact.length() < 3) {
            return false;
        }
        char first = compact.charAt(0);
        for (int i = 1; i < compact.length(); i += 1) {
            if (compact.charAt(i) != first) {
                return false;
            }
        }
        return true;
    }

    private String normalizeRecordBook(String value) {
        String normalized = trimToNull(value);
        if (normalized == null || !normalized.matches("^\\d{2}/\\d{3}$")) {
            throw new BusinessValidationException("Номер зачётной книжки должен быть в формате 20/658.");
        }
        return normalized;
    }

    private void ensureRecordBookUnique(String recordBook, Long currentStudentId) {
        boolean existsExact = currentStudentId == null
                ? studentRepository.existsByRecordBook(recordBook)
                : studentRepository.existsByRecordBookAndIdNot(recordBook, currentStudentId);
        boolean exists = studentRepository.existsByNormalizedRecordBook(
                recordBookYearPart(recordBook),
                recordBookSuffixPart(recordBook),
                currentStudentId
        );
        if (existsExact || exists) {
            throw new BusinessValidationException(DUPLICATE_STUDENT_DOC_MESSAGE);
        }
    }

    private void ensureContractNumberUnique(String contractNumber, Long currentStudentId) {
        boolean existsExact = currentStudentId == null
                ? studentRepository.existsByStudyContractNumber(contractNumber)
                : studentRepository.existsByStudyContractNumberAndIdNot(contractNumber, currentStudentId);
        boolean exists = studentRepository.existsByNormalizedStudyContractNumber(
                contractYearPart(contractNumber),
                contractSuffixPart(contractNumber),
                currentStudentId
        );
        if (existsExact || exists) {
            throw new BusinessValidationException(DUPLICATE_STUDENT_DOC_MESSAGE);
        }
    }

    private LocalDate resolveAdmissionDate(LocalDate studyStartDate, StudentStatus status) {
        if (status == StudentStatus.NEW) {
            return studyStartDate;
        }
        if (studyStartDate == null) {
            throw new BusinessValidationException("Укажите дату начала обучения.");
        }
        return studyStartDate;
    }

    private List<Long> parseStudentIds(String rawStudentIds) {
        if (rawStudentIds == null || rawStudentIds.isBlank()) {
            return new ArrayList<>();
        }
        List<Long> result = new ArrayList<>();
        for (String chunk : rawStudentIds.split(",")) {
            String trimmed = chunk == null ? "" : chunk.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try {
                result.add(Long.parseLong(trimmed));
            } catch (NumberFormatException ignored) {
                // ignore malformed id values in legacy data
            }
        }
        return result;
    }

    private String joinStudentIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return "";
        }
        return ids.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(","));
    }

    private List<OrderStudentItemDto> parseStudentItems(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return new ArrayList<>();
        }
        try {
            List<OrderStudentItemDto> parsed = objectMapper.readValue(rawJson, ORDER_STUDENT_ITEM_LIST_TYPE);
            if (parsed == null) {
                return new ArrayList<>();
            }
            return new ArrayList<>(parsed);
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }

    private String writeStudentItems(List<OrderStudentItemDto> items) {
        if (items == null || items.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(items);
        } catch (Exception ex) {
            throw new BusinessValidationException("Не удалось обновить данные приказов при удалении студента.");
        }
    }

    private String buildStudentsList(List<OrderStudentItemDto> items) {
        if (items == null || items.isEmpty()) {
            return "";
        }
        int index = 1;
        StringBuilder builder = new StringBuilder();
        for (OrderStudentItemDto item : items) {
            if (item == null) {
                continue;
            }
            String name = item.getStudentName() == null ? "" : item.getStudentName().trim();
            if (name.isEmpty()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append(System.lineSeparator());
            }
            builder.append(index++).append(") ").append(name);
        }
        return builder.toString();
    }

    private String removeStudentFromExecutionSnapshot(String rawJson, Long studentId) {
        if (rawJson == null || rawJson.isBlank()) {
            return rawJson;
        }
        if (studentId == null) {
            return rawJson;
        }
        try {
            List<ExecutionSnapshotItem> snapshotItems = objectMapper.readValue(rawJson, EXECUTION_SNAPSHOT_LIST_TYPE);
            if (snapshotItems == null || snapshotItems.isEmpty()) {
                return null;
            }
            boolean changed = snapshotItems.removeIf(item -> item != null && Objects.equals(item.getStudentId(), studentId));
            if (!changed) {
                return rawJson;
            }
            if (snapshotItems.isEmpty()) {
                return null;
            }
            return objectMapper.writeValueAsString(snapshotItems);
        } catch (Exception ignored) {
            return rawJson;
        }
    }

    private static class ExecutionSnapshotItem {
        private Long studentId;
        private String status;
        private Integer course;
        private Long groupId;

        public Long getStudentId() {
            return studentId;
        }

        public void setStudentId(Long studentId) {
            this.studentId = studentId;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
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

    private String normalizeEducationForm(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new BusinessValidationException("Укажите форму обучения.");
        }
        if (!"Очная".equals(normalized) && !"Очно-заочная".equals(normalized) && !"Заочная".equals(normalized)) {
            throw new BusinessValidationException("Форма обучения указана некорректно.");
        }
        return normalized;
    }

    private String normalizeEducationBase(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new BusinessValidationException("Укажите основу обучения.");
        }
        if (!"Бюджет".equals(normalized) && !"Внебюджет".equals(normalized)) {
            throw new BusinessValidationException("Основа обучения указана некорректно.");
        }
        return normalized;
    }

    private String normalizeContractNumber(String value) {
        String normalized = trimToNull(value);
        if (normalized == null || !normalized.matches("^\\d{4}-З-\\d{3}$")) {
            throw new BusinessValidationException("Номер договора должен быть в формате 2025-З-001.");
        }
        return normalized;
    }

    private void ensureRecordBookMatchesStudyStartDate(String recordBook, LocalDate studyStartDate) {
        if (studyStartDate == null) {
            return;
        }
        String expectedYearPart = "%02d".formatted(studyStartDate.getYear() % 100);
        if (!expectedYearPart.equals(recordBookYearPart(recordBook))) {
            throw new BusinessValidationException("Год в номере зачётной книжки должен совпадать с датой начала обучения.");
        }
    }

    private void ensureContractNumberMatchesStudyStartDate(String contractNumber, LocalDate studyStartDate) {
        if (studyStartDate == null) {
            return;
        }
        String expectedYearPart = Integer.toString(studyStartDate.getYear());
        if (!contractNumber.startsWith(expectedYearPart + "-З-")) {
            throw new BusinessValidationException("Год в номере договора должен совпадать с датой начала обучения.");
        }
    }

    private String recordBookYearPart(String recordBook) {
        return recordBook.substring(0, 2);
    }

    private String recordBookSuffixPart(String recordBook) {
        return recordBook.substring(3, 6);
    }

    private String normalizeRecordBookSuffix(String rawRecordBook) {
        if (rawRecordBook == null || rawRecordBook.isBlank()) {
            return "";
        }
        String digits = rawRecordBook.replaceAll("\\D", "");
        if (digits.isEmpty()) {
            return "";
        }
        if (digits.length() >= 3) {
            return digits.substring(digits.length() - 3);
        }
        return String.format("%03d", Integer.parseInt(digits));
    }

    private String studyYearTwoDigits(LocalDate date) {
        if (date == null) {
            return "";
        }
        return "%02d".formatted(date.getYear() % 100);
    }

    private String contractYearPart(String contractNumber) {
        return contractNumber.substring(0, 4);
    }

    private String contractSuffixPart(String contractNumber) {
        return contractNumber.substring(7, 10);
    }

    private String normalizeContractSuffix(String rawContractNumber) {
        if (rawContractNumber == null || rawContractNumber.isBlank()) {
            return "";
        }
        String digits = rawContractNumber.replaceAll("\\D", "");
        if (digits.isEmpty()) {
            return "";
        }
        if (digits.length() >= 3) {
            return digits.substring(digits.length() - 3);
        }
        return String.format("%03d", Integer.parseInt(digits));
    }

    private String studyYearFourDigits(LocalDate date) {
        if (date == null) {
            return "";
        }
        return Integer.toString(date.getYear());
    }

    private String normalizePhone(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        if (!normalized.matches("^\\+7 \\(\\d{3}\\) \\d{3}-\\d{2}-\\d{2}$")) {
            throw new BusinessValidationException("Телефон должен быть в формате +7 (000) 000-00-00.");
        }
        return normalized;
    }
}
