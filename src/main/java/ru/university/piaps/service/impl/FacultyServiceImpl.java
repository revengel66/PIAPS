package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.FacultyDeleteTransferRequest;
import ru.university.piaps.dto.FacultyDto;
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
import ru.university.piaps.service.FacultyService;

import java.util.regex.Pattern;
import java.util.Locale;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FacultyServiceImpl implements FacultyService {

    private static final Set<String> ABBREVIATION_SKIP_WORDS = Set.of(
            "и", "в", "во", "на", "по", "для", "с", "со", "о", "об", "от", "к", "ко", "у", "из"
    );
    private static final Pattern FACULTY_PREFIX_PATTERN = Pattern.compile("^\\s*факультет\\s+", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern MULTI_SPACE_PATTERN = Pattern.compile("\\s+");
    private static final Pattern ALLOWED_NAME_PATTERN = Pattern.compile("^[\\p{L}\\-\\s]+$");
    private static final Pattern ALLOWED_SHORT_NAME_PATTERN = Pattern.compile("^[\\p{L}\\p{N}\\-]+$");

    private final FacultyRepository facultyRepository;
    private final StudentRepository studentRepository;
    private final DirectionRepository directionRepository;
    private final StudentGroupRepository groupRepository;
    private final CurriculumRepository curriculumRepository;
    private final StudentStateHistoryService historyService;
    private final StudentStateHistoryRepository historyRepository;

    @Override
    @Transactional(readOnly = true)
    public List<FacultyDto> findAll() {
        List<Faculty> faculties = facultyRepository.findAll();
        Map<Long, Long> studentsByFaculty = loadStudentsByFaculty(faculties);
        return faculties.stream()
                .map(faculty -> toDto(faculty, studentsByFaculty))
                .toList();
    }

    @Override
    @Transactional
    public FacultyDto create(FacultyDto request) {
        String name = normalizeName(request.getName());
        validateNormalizedName(name);
        String shortName = resolveShortName(name, request.getShortName());
        Faculty faculty = Faculty.builder()
                .name(name)
                .shortName(shortName)
                .build();
        return toDto(facultyRepository.save(faculty), Map.of());
    }

    @Override
    @Transactional
    public FacultyDto update(Long id, FacultyDto request) {
        Faculty faculty = facultyRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));
        String name = normalizeName(request.getName());
        validateNormalizedName(name);
        faculty.setName(name);
        faculty.setShortName(resolveShortName(name, request.getShortName()));
        return toDto(facultyRepository.save(faculty), Map.of());
    }

    @Override
    @Transactional
    public void delete(Long id) {
        Faculty faculty = facultyRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));
        if (studentRepository.countByGroupDirectionFacultyId(id) > 0) {
            throw new BusinessValidationException("Перед удалением факультета необходимо перевести всех студентов.");
        }
        List<Direction> sourceDirections = directionRepository.findAllByFacultyId(id);
        List<Long> sourceDirectionIds = sourceDirections.stream()
                .map(Direction::getId)
                .filter(Objects::nonNull)
                .toList();
        if (!sourceDirectionIds.isEmpty()) {
            clearHistoryGroupReferencesByDirectionIds(sourceDirectionIds);
            curriculumRepository.deleteAllByDirectionIdIn(sourceDirectionIds);
            groupRepository.deleteAllByDirectionIdIn(sourceDirectionIds);
            directionRepository.deleteAllByFacultyId(id);
        }
        facultyRepository.delete(faculty);
    }

    @Override
    @Transactional
    public void deleteWithTransfer(Long id, FacultyDeleteTransferRequest request) {
        Faculty faculty = facultyRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));

        List<Direction> sourceDirections = directionRepository.findAllByFacultyId(id);
        List<Long> sourceDirectionIds = sourceDirections.stream()
                .map(Direction::getId)
                .filter(Objects::nonNull)
                .toList();

        if (sourceDirectionIds.isEmpty()) {
            facultyRepository.delete(faculty);
            return;
        }

        List<Student> students = studentRepository.findAllByGroupDirectionIdIn(sourceDirectionIds);
        if (!students.isEmpty()) {
            Map<Long, Student> studentsById = students.stream()
                    .collect(Collectors.toMap(Student::getId, student -> student));
            Map<Long, Long> assignmentByStudentId = normalizeAssignments(request != null ? request.getAssignments() : null);
            if (assignmentByStudentId.size() < studentsById.size()) {
                throw new BusinessValidationException("Для удаления факультета необходимо выбрать группы перевода для всех студентов.");
            }
            for (Long studentId : assignmentByStudentId.keySet()) {
                if (!studentsById.containsKey(studentId)) {
                    throw new BusinessValidationException("Найдены назначения для студентов, не относящихся к удаляемому факультету.");
                }
            }

            Set<Long> targetGroupIds = assignmentByStudentId.values().stream()
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            Map<Long, StudentGroup> targetGroupsById = groupRepository.findAllById(targetGroupIds).stream()
                    .filter(group -> group.getId() != null)
                    .collect(Collectors.toMap(StudentGroup::getId, group -> group));
            if (targetGroupsById.size() != targetGroupIds.size()) {
                throw new BusinessValidationException("Выбрана недоступная группа перевода.");
            }

            for (Student student : students) {
                Long targetGroupId = assignmentByStudentId.get(student.getId());
                if (targetGroupId == null) {
                    throw new BusinessValidationException("Для всех студентов должна быть выбрана группа перевода.");
                }
                StudentGroup targetGroup = targetGroupsById.get(targetGroupId);
                if (targetGroup == null) {
                    throw new BusinessValidationException("Для всех студентов должна быть выбрана корректная группа перевода.");
                }
                Long targetFacultyId = targetGroup.getDirection() != null && targetGroup.getDirection().getFaculty() != null
                        ? targetGroup.getDirection().getFaculty().getId()
                        : null;
                if (Objects.equals(targetFacultyId, id)) {
                    throw new BusinessValidationException("При удалении факультета нельзя переводить студентов на направления этого же факультета.");
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

        if (studentRepository.countByGroupDirectionFacultyId(id) > 0) {
            throw new BusinessValidationException("Не удалось перевести всех студентов с удаляемого факультета.");
        }

        clearHistoryGroupReferencesByDirectionIds(sourceDirectionIds);
        curriculumRepository.deleteAllByDirectionIdIn(sourceDirectionIds);
        groupRepository.deleteAllByDirectionIdIn(sourceDirectionIds);
        directionRepository.deleteAllByFacultyId(id);
        facultyRepository.delete(faculty);
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

    private FacultyDto toDto(Faculty faculty, Map<Long, Long> studentsByFaculty) {
        String normalizedName = normalizeName(faculty.getName());
        String normalizedShortName = normalizeShortName(faculty.getShortName());
        if (normalizedShortName.isBlank()) {
            normalizedShortName = buildAbbreviation(normalizedName);
        }
        return FacultyDto.builder()
                .id(faculty.getId())
                .name(normalizedName)
                .shortName(normalizedShortName)
                .studentsCount(studentsByFaculty.getOrDefault(faculty.getId(), 0L))
                .build();
    }

    private Map<Long, Long> loadStudentsByFaculty(List<Faculty> faculties) {
        if (faculties.isEmpty()) {
            return Map.of();
        }
        List<Long> facultyIds = faculties.stream()
                .map(Faculty::getId)
                .filter(id -> id != null)
                .toList();
        if (facultyIds.isEmpty()) {
            return Map.of();
        }
        return studentRepository.countStudentsByFacultyIdsAndStatuses(
                        facultyIds,
                        List.of(StudentStatus.ACTIVE, StudentStatus.ACADEMIC_LEAVE)
                ).stream()
                .collect(Collectors.toMap(
                        row -> (Long) row[0],
                        row -> (Long) row[1]
                ));
    }

    private String normalizeName(String rawName) {
        if (rawName == null) {
            return "";
        }
        String withoutPrefix = FACULTY_PREFIX_PATTERN.matcher(rawName).replaceFirst("");
        return MULTI_SPACE_PATTERN.matcher(withoutPrefix).replaceAll(" ").trim();
    }

    private void validateNormalizedName(String normalizedName) {
        if (normalizedName.isBlank()) {
            throw new BusinessValidationException("Укажите название факультета без слова «Факультет».");
        }
        if (normalizedName.length() < 6 || normalizedName.length() > 80) {
            throw new BusinessValidationException("Название факультета должно быть от 6 до 80 символов.");
        }
        if (!ALLOWED_NAME_PATTERN.matcher(normalizedName).matches()) {
            throw new BusinessValidationException("Название факультета выглядит некорректно.");
        }
        if (isRepeatingSingleSymbol(normalizedName)) {
            throw new BusinessValidationException("Название факультета выглядит некорректно.");
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

    private String resolveShortName(String normalizedName, String requestedShortName) {
        String manualShortName = normalizeShortName(requestedShortName);
        if (manualShortName.isBlank()) {
            return buildAbbreviation(normalizedName);
        }
        validateShortName(manualShortName);
        return manualShortName;
    }

    private String normalizeShortName(String rawShortName) {
        if (rawShortName == null) {
            return "";
        }
        String withoutSpaces = MULTI_SPACE_PATTERN.matcher(rawShortName).replaceAll("");
        return withoutSpaces.trim().toUpperCase(Locale.ROOT);
    }

    private void validateShortName(String shortName) {
        if (shortName.length() > 32) {
            throw new BusinessValidationException("Аббревиатура факультета должна быть не длиннее 32 символов.");
        }
        if (!ALLOWED_SHORT_NAME_PATTERN.matcher(shortName).matches()) {
            throw new BusinessValidationException("Аббревиатура факультета может содержать только буквы, цифры и дефис.");
        }
    }

    private String buildAbbreviation(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return null;
        }
        String[] words = fullName.trim().split("\\s+");
        StringBuilder builder = new StringBuilder("Ф");
        for (int i = 0; i < words.length; i++) {
            String word = words[i];
            String normalized = word.toLowerCase(Locale.ROOT);
            // Первое слово всегда учитываем, служебные слова пропускаем только со второго.
            if (i > 0 && ABBREVIATION_SKIP_WORDS.contains(normalized)) {
                continue;
            }
            char first = word.charAt(0);
            if (Character.isLetter(first)) {
                builder.append(Character.toUpperCase(first));
            }
        }
        if (builder.length() == 1) {
            char first = fullName.charAt(0);
            if (Character.isLetter(first)) {
                builder.append(Character.toUpperCase(first));
            }
        }
        return builder.toString();
    }
}
