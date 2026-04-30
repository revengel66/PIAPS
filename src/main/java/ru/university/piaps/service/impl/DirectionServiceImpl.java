package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.DirectionDeleteTransferRequest;
import ru.university.piaps.dto.DirectionDto;
import ru.university.piaps.dto.StudentTransferAssignmentRequest;
import ru.university.piaps.exception.BusinessValidationException;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.Direction;
import ru.university.piaps.model.Faculty;
import ru.university.piaps.model.Student;
import ru.university.piaps.model.StudentGroup;
import ru.university.piaps.model.StudentStatus;
import ru.university.piaps.repository.CurriculumRepository;
import ru.university.piaps.repository.DirectionRepository;
import ru.university.piaps.repository.FacultyRepository;
import ru.university.piaps.repository.StudentGroupRepository;
import ru.university.piaps.repository.StudentRepository;
import ru.university.piaps.repository.StudentStateHistoryRepository;
import ru.university.piaps.service.DirectionService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.ArrayList;

@Service
@RequiredArgsConstructor
public class DirectionServiceImpl implements DirectionService {

    private static final Set<String> ABBREVIATION_SKIP_WORDS = Set.of(
            "и", "в", "во", "на", "по", "для", "с", "со", "о", "об", "от", "к", "ко", "у", "из"
    );
    private static final Pattern MULTI_SPACE_PATTERN = Pattern.compile("\\s+");
    private static final Pattern ALLOWED_NAME_PATTERN = Pattern.compile("^[\\p{L}\\-\\s]+$");
    private static final Pattern ALLOWED_SHORT_NAME_PATTERN = Pattern.compile("^[\\p{L}\\p{N}\\-]+$");

    private final DirectionRepository directionRepository;
    private final FacultyRepository facultyRepository;
    private final StudentRepository studentRepository;
    private final StudentGroupRepository groupRepository;
    private final CurriculumRepository curriculumRepository;
    private final StudentStateHistoryService historyService;
    private final StudentStateHistoryRepository historyRepository;

    @Override
    @Transactional(readOnly = true)
    public List<DirectionDto> findAll(Long facultyId) {
        List<Direction> source = facultyId == null
                ? directionRepository.findAll()
                : directionRepository.findAllByFacultyId(facultyId);
        Map<Long, Long> studentsByDirection = loadStudentsByDirection(source);
        return source.stream().map(direction -> toDto(direction, studentsByDirection)).toList();
    }

    @Override
    @Transactional
    public DirectionDto create(DirectionDto request) {
        Faculty faculty = facultyRepository.findById(request.getFacultyId())
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));
        String code = request.getCode().trim();
        String name = normalizeName(request.getName());
        validateNormalizedName(name);
        BigDecimal annualTuition = normalizeAnnualTuition(request.getAnnualTuition());
        String shortName = resolveShortName(name, request.getShortName(), null);
        Direction direction = Direction.builder()
                .code(code)
                .name(name)
                .shortName(shortName)
                .annualTuition(annualTuition)
                .faculty(faculty)
                .build();
        return toDto(directionRepository.save(direction), Map.of());
    }

    @Override
    @Transactional
    public DirectionDto update(Long id, DirectionDto request) {
        Direction direction = directionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Направление не найдено"));
        Faculty faculty = facultyRepository.findById(request.getFacultyId())
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));
        direction.setCode(request.getCode().trim());
        String name = normalizeName(request.getName());
        validateNormalizedName(name);
        direction.setName(name);
        direction.setShortName(resolveShortName(name, request.getShortName(), id));
        direction.setAnnualTuition(normalizeAnnualTuition(request.getAnnualTuition()));
        direction.setFaculty(faculty);
        return toDto(directionRepository.save(direction), Map.of());
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!directionRepository.existsById(id)) {
            throw new ResourceNotFoundException("Направление не найдено");
        }
        if (studentRepository.countByGroupDirectionId(id) > 0) {
            throw new BusinessValidationException("Перед удалением направления необходимо перевести всех студентов.");
        }
        clearHistoryGroupReferencesByDirectionIds(List.of(id));
        curriculumRepository.deleteAllByDirectionId(id);
        groupRepository.deleteAllByDirectionId(id);
        directionRepository.deleteById(id);
    }

    @Override
    @Transactional
    public void deleteWithTransfer(Long id, DirectionDeleteTransferRequest request) {
        Direction sourceDirection = directionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Направление не найдено"));
        List<Student> students = studentRepository.findAllByGroupDirectionId(id);

        if (!students.isEmpty()) {
            if (request == null || request.getTargetDirectionId() == null) {
                throw new BusinessValidationException("Выберите направление, на которое переводятся студенты.");
            }
            Long targetDirectionId = request.getTargetDirectionId();
            if (Objects.equals(targetDirectionId, id)) {
                throw new BusinessValidationException("Направление перевода должно отличаться от удаляемого.");
            }
            Direction targetDirection = directionRepository.findById(targetDirectionId)
                    .orElseThrow(() -> new ResourceNotFoundException("Направление перевода не найдено"));
            Long sourceFacultyId = sourceDirection.getFaculty() != null ? sourceDirection.getFaculty().getId() : null;
            Long targetFacultyId = targetDirection.getFaculty() != null ? targetDirection.getFaculty().getId() : null;
            if (!Objects.equals(sourceFacultyId, targetFacultyId)) {
                throw new BusinessValidationException("Перевод при удалении направления возможен только в рамках одного факультета.");
            }

            List<StudentGroup> targetGroups = groupRepository.findAllByDirectionId(targetDirectionId);
            if (targetGroups.isEmpty()) {
                throw new BusinessValidationException("У направления перевода отсутствуют группы.");
            }
            Map<Long, StudentGroup> targetGroupById = targetGroups.stream()
                    .filter(group -> group.getId() != null)
                    .collect(Collectors.toMap(StudentGroup::getId, group -> group));

            Map<Long, Student> studentsById = students.stream()
                    .collect(Collectors.toMap(Student::getId, student -> student));
            Map<Long, Long> assignmentByStudentId = normalizeAssignments(request.getAssignments());

            if (assignmentByStudentId.size() < studentsById.size()) {
                throw new BusinessValidationException("Для удаления направления необходимо выбрать группы перевода для всех студентов.");
            }

            for (Long studentId : assignmentByStudentId.keySet()) {
                if (!studentsById.containsKey(studentId)) {
                    throw new BusinessValidationException("Найдены назначения для студентов, не относящихся к удаляемому направлению.");
                }
            }

            for (Student student : students) {
                Long targetGroupId = assignmentByStudentId.get(student.getId());
                if (targetGroupId == null) {
                    throw new BusinessValidationException("Для всех студентов должна быть выбрана группа перевода.");
                }
                StudentGroup targetGroup = targetGroupById.get(targetGroupId);
                if (targetGroup == null) {
                    throw new BusinessValidationException("Выбрана недоступная группа перевода.");
                }
                student.setGroup(targetGroup);
                if (targetGroup.getCourse() != null) {
                    student.setCourse(targetGroup.getCourse());
                }
            }

            List<Student> savedStudents = studentRepository.saveAll(students);
            LocalDate today = LocalDate.now();
            for (Student student : savedStudents) {
                historyService.recordStudentState(student, today);
            }
        }

        if (studentRepository.countByGroupDirectionId(id) > 0) {
            throw new BusinessValidationException("Не удалось перевести всех студентов с удаляемого направления.");
        }
        clearHistoryGroupReferencesByDirectionIds(List.of(id));
        curriculumRepository.deleteAllByDirectionId(id);
        groupRepository.deleteAllByDirectionId(id);
        directionRepository.deleteById(id);
    }

    private Map<Long, Long> normalizeAssignments(List<StudentTransferAssignmentRequest> assignments) {
        Map<Long, Long> result = new HashMap<>();
        if (assignments == null || assignments.isEmpty()) {
            return result;
        }
        for (StudentTransferAssignmentRequest assignment : assignments) {
            if (assignment == null || assignment.getStudentId() == null) {
                continue;
            }
            if (result.containsKey(assignment.getStudentId())) {
                throw new BusinessValidationException("Для одного студента указано несколько групп перевода.");
            }
            result.put(assignment.getStudentId(), assignment.getTargetGroupId());
        }
        return result;
    }

    private void clearHistoryGroupReferencesByDirectionIds(List<Long> directionIds) {
        if (directionIds == null || directionIds.isEmpty()) {
            return;
        }
        List<Long> groupIds = groupRepository.findAllByDirectionIdIn(directionIds).stream()
                .map(StudentGroup::getId)
                .filter(Objects::nonNull)
                .toList();
        if (groupIds.isEmpty()) {
            return;
        }
        historyRepository.clearGroupReferences(groupIds);
    }

    private Map<Long, Long> loadStudentsByDirection(List<Direction> directions) {
        if (directions.isEmpty()) {
            return Map.of();
        }
        List<Long> directionIds = directions.stream()
                .map(Direction::getId)
                .filter(id -> id != null)
                .toList();
        if (directionIds.isEmpty()) {
            return Map.of();
        }
        return studentRepository.countStudentsByDirectionIdsAndStatuses(
                        directionIds,
                        List.of(StudentStatus.ACTIVE, StudentStatus.ACADEMIC_LEAVE)
                ).stream()
                .collect(Collectors.toMap(
                        row -> (Long) row[0],
                        row -> (Long) row[1]
                ));
    }

    private DirectionDto toDto(Direction direction, Map<Long, Long> studentsByDirection) {
        String normalizedName = normalizeName(direction.getName());
        String shortName = normalizeShortName(direction.getShortName());
        if (shortName == null || shortName.isBlank()) {
            shortName = buildAbbreviation(normalizedName);
        }
        return DirectionDto.builder()
                .id(direction.getId())
                .code(direction.getCode())
                .name(normalizedName)
                .facultyId(direction.getFaculty() != null ? direction.getFaculty().getId() : null)
                .facultyName(direction.getFaculty() != null ? direction.getFaculty().getName() : null)
                .shortName(shortName)
                .annualTuition(formatAnnualTuition(direction.getAnnualTuition()))
                .createdAt(direction.getCreatedAt())
                .studentsCount(studentsByDirection.getOrDefault(direction.getId(), 0L))
                .build();
    }

    private BigDecimal normalizeAnnualTuition(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().replace('\u00A0', ' ');
        normalized = normalized.replaceAll("(?iu)\\s*руб\\.?\\s*(в\\s*год)?\\s*$", "");
        normalized = normalized.replaceAll("(?iu)\\s*рубл(ей|я|ь)?\\s*(в\\s*год)?\\s*$", "");
        normalized = normalized.replaceAll("(?iu)\\s*в\\s*год\\s*$", "");
        normalized = normalized.replaceAll("\\s+", "");
        normalized = normalized.replace(',', '.');
        normalized = normalized.replaceAll("[^0-9.]", "");
        if (normalized.isEmpty()) {
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

        BigDecimal amount;
        try {
            amount = new BigDecimal(normalized);
        } catch (NumberFormatException ex) {
            throw new BusinessValidationException("Размер оплаты выглядит некорректно.");
        }
        amount = amount.setScale(2, RoundingMode.HALF_UP);
        String integerPart = amount.abs().toBigInteger().toString();
        if (integerPart.length() > 8) {
            throw new BusinessValidationException("Размер оплаты должен содержать не более 8 цифр.");
        }
        return amount;
    }

    private String formatAnnualTuition(BigDecimal value) {
        if (value == null) {
            return null;
        }
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String resolveShortName(String normalizedName, String requestedShortName, Long excludeDirectionId) {
        String manualShortName = normalizeShortName(requestedShortName);
        if (manualShortName.isBlank()) {
            return resolveUniqueAbbreviation(normalizedName, excludeDirectionId);
        }
        validateShortName(manualShortName);
        boolean exists = excludeDirectionId == null
                ? directionRepository.existsByShortNameIgnoreCase(manualShortName)
                : directionRepository.existsByShortNameIgnoreCaseAndIdNot(manualShortName, excludeDirectionId);
        if (exists) {
            throw new BusinessValidationException("Такая аббревиатура направления уже используется. Укажите другую.");
        }
        return manualShortName;
    }

    private String normalizeShortName(String rawShortName) {
        if (rawShortName == null) {
            return "";
        }
        return MULTI_SPACE_PATTERN.matcher(rawShortName).replaceAll("")
                .trim()
                .toUpperCase(Locale.ROOT);
    }

    private void validateShortName(String shortName) {
        if (shortName.length() > 16) {
            throw new BusinessValidationException("Аббревиатура направления должна быть не длиннее 16 символов.");
        }
        if (!ALLOWED_SHORT_NAME_PATTERN.matcher(shortName).matches()) {
            throw new BusinessValidationException("Аббревиатура направления может содержать только буквы, цифры и дефис.");
        }
    }

    private String normalizeName(String rawName) {
        if (rawName == null) {
            return "";
        }
        return MULTI_SPACE_PATTERN.matcher(rawName).replaceAll(" ").trim();
    }

    private void validateNormalizedName(String normalizedName) {
        if (normalizedName.isBlank()) {
            throw new BusinessValidationException("Укажите название направления.");
        }
        if (normalizedName.length() < 2 || normalizedName.length() > 80) {
            throw new BusinessValidationException("Название направления должно быть от 2 до 80 символов.");
        }
        if (!ALLOWED_NAME_PATTERN.matcher(normalizedName).matches()) {
            throw new BusinessValidationException("Название направления выглядит некорректно.");
        }
        if (isRepeatingSingleSymbol(normalizedName)) {
            throw new BusinessValidationException("Название направления выглядит некорректно.");
        }
    }

    private boolean isRepeatingSingleSymbol(String value) {
        String compact = MULTI_SPACE_PATTERN.matcher(value).replaceAll("").toLowerCase(Locale.ROOT);
        if (compact.length() < 3) {
            return false;
        }
        char first = compact.charAt(0);
        for (int i = 1; i < compact.length(); i++) {
            if (compact.charAt(i) != first) {
                return false;
            }
        }
        return true;
    }

    private String buildAbbreviation(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return null;
        }
        String[] words = fullName.trim().split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < words.length; i++) {
            String word = words[i];
            String normalized = word.toLowerCase(Locale.ROOT);
            if (i > 0 && ABBREVIATION_SKIP_WORDS.contains(normalized)) {
                continue;
            }
            char first = word.charAt(0);
            if (Character.isLetter(first)) {
                builder.append(Character.toUpperCase(first));
            }
        }
        if (builder.isEmpty()) {
            char first = fullName.charAt(0);
            if (Character.isLetter(first)) {
                builder.append(Character.toUpperCase(first));
            }
        }
        return builder.toString();
    }

    private String resolveUniqueAbbreviation(String fullName, Long excludeDirectionId) {
        List<String> words = extractSignificantWords(fullName);
        if (words.isEmpty()) {
            return null;
        }
        List<String> candidates = new ArrayList<>();
        String base = initials(words);
        if (base != null && !base.isBlank()) {
            candidates.add(base);
        }

        String firstWord = words.get(0);
        for (int firstLen = 2; firstLen <= Math.min(6, firstWord.length()); firstLen++) {
            candidates.add(firstWord.substring(0, firstLen) + initials(words.subList(1, words.size())));
        }

        if (words.size() >= 2) {
            String secondWord = words.get(1);
            for (int secondLen = 2; secondLen <= Math.min(6, secondWord.length()); secondLen++) {
                candidates.add(firstWord.substring(0, 1) + secondWord.substring(0, secondLen) + initials(words.subList(2, words.size())));
            }
            for (int firstLen = 2; firstLen <= Math.min(4, firstWord.length()); firstLen++) {
                for (int secondLen = 2; secondLen <= Math.min(4, secondWord.length()); secondLen++) {
                    candidates.add(firstWord.substring(0, firstLen) + secondWord.substring(0, secondLen) + initials(words.subList(2, words.size())));
                }
            }
        }

        for (String candidate : candidates) {
            String normalized = normalizeShortNameCandidate(candidate);
            if (normalized.isBlank()) {
                continue;
            }
            boolean exists = excludeDirectionId == null
                    ? directionRepository.existsByShortNameIgnoreCase(normalized)
                    : directionRepository.existsByShortNameIgnoreCaseAndIdNot(normalized, excludeDirectionId);
            if (!exists) {
                return normalized;
            }
        }
        throw new BusinessValidationException("Не удалось сформировать уникальную аббревиатуру направления. Уточните название направления.");
    }

    private List<String> extractSignificantWords(String fullName) {
        String normalized = normalizeName(fullName);
        if (normalized.isBlank()) {
            return List.of();
        }
        String[] rawWords = normalized.split("\\s+");
        List<String> words = new ArrayList<>();
        for (int i = 0; i < rawWords.length; i++) {
            String onlyLetters = rawWords[i].replaceAll("[^\\p{L}]", "");
            if (onlyLetters.isBlank()) {
                continue;
            }
            String lower = onlyLetters.toLowerCase(Locale.ROOT);
            if (i > 0 && ABBREVIATION_SKIP_WORDS.contains(lower)) {
                continue;
            }
            words.add(onlyLetters.toUpperCase(Locale.ROOT));
        }
        return words;
    }

    private String initials(List<String> words) {
        if (words == null || words.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (String word : words) {
            if (word == null || word.isBlank()) {
                continue;
            }
            builder.append(word.charAt(0));
        }
        return builder.toString();
    }

    private String normalizeShortNameCandidate(String value) {
        String normalized = String.valueOf(value == null ? "" : value)
                .replaceAll("[^\\p{L}]", "")
                .toUpperCase(Locale.ROOT)
                .trim();
        if (normalized.length() > 16) {
            normalized = normalized.substring(0, 16);
        }
        return normalized;
    }
}
