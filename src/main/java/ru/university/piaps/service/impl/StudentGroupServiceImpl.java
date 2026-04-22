package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.GroupDeleteTransferRequest;
import ru.university.piaps.dto.StudentGroupDto;
import ru.university.piaps.exception.BusinessValidationException;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.Direction;
import ru.university.piaps.model.Student;
import ru.university.piaps.model.StudentGroup;
import ru.university.piaps.model.StudentStatus;
import ru.university.piaps.repository.DirectionRepository;
import ru.university.piaps.repository.StudentRepository;
import ru.university.piaps.repository.StudentGroupRepository;
import ru.university.piaps.repository.StudentStateHistoryRepository;
import ru.university.piaps.service.StudentGroupService;

import java.util.List;
import java.util.Locale;
import java.time.LocalDate;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StudentGroupServiceImpl implements StudentGroupService {

    private static final Pattern GROUP_CODE_PATTERN = Pattern.compile(
            "^([\\p{L}]+)([бсм])([двз])(у?)-(\\d)(\\d)$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Set<String> ABBREVIATION_SKIP_WORDS = Set.of(
            "и", "в", "во", "на", "по", "для", "с", "со", "о", "об", "от", "к", "ко", "у", "из"
    );

    private final StudentGroupRepository groupRepository;
    private final DirectionRepository directionRepository;
    private final StudentRepository studentRepository;
    private final StudentStateHistoryService historyService;
    private final StudentStateHistoryRepository historyRepository;

    @Override
    @Transactional(readOnly = true)
    public List<StudentGroupDto> findAll(Long directionId) {
        List<StudentGroup> groups = directionId == null
                ? groupRepository.findAll()
                : groupRepository.findAllByDirectionId(directionId);
        Map<Long, Long> studentsByGroup = loadStudentsByGroup(groups);
        return groups.stream().map(group -> toDto(group, studentsByGroup)).toList();
    }

    @Override
    @Transactional
    public StudentGroupDto create(StudentGroupDto request) {
        Direction direction = directionRepository.findById(request.getDirectionId())
                .orElseThrow(() -> new ResourceNotFoundException("Направление не найдено"));
        String educationLevel = normalizeEducationLevel(request.getEducationLevel());
        String educationForm = normalizeEducationForm(request.getEducationForm());
        boolean accelerated = Boolean.TRUE.equals(request.getAccelerated());
        validateCourseForLevel(request.getCourse(), educationLevel, accelerated);
        String groupCode = buildGroupCode(
                direction,
                request.getCourse(),
                request.getGroupNumber(),
                educationLevel,
                educationForm,
                accelerated
        );
        validateGroupCodeUnique(groupCode, null);
        StudentGroup group = StudentGroup.builder()
                .code(groupCode)
                .course(request.getCourse())
                .educationLevel(educationLevel)
                .educationForm(educationForm)
                .accelerated(accelerated)
                .groupNumber(request.getGroupNumber())
                .direction(direction)
                .build();
        return toDto(groupRepository.save(group), Map.of());
    }

    @Override
    @Transactional
    public StudentGroupDto update(Long id, StudentGroupDto request) {
        StudentGroup group = groupRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Группа не найдена"));
        Direction direction = directionRepository.findById(request.getDirectionId())
                .orElseThrow(() -> new ResourceNotFoundException("Направление не найдено"));
        String educationLevel = normalizeEducationLevel(request.getEducationLevel());
        String educationForm = normalizeEducationForm(request.getEducationForm());
        boolean accelerated = Boolean.TRUE.equals(request.getAccelerated());
        validateCourseForLevel(request.getCourse(), educationLevel, accelerated);
        String groupCode = buildGroupCode(
                direction,
                request.getCourse(),
                request.getGroupNumber(),
                educationLevel,
                educationForm,
                accelerated
        );
        validateGroupCodeUnique(groupCode, id);
        group.setCode(groupCode);
        group.setCourse(request.getCourse());
        group.setEducationLevel(educationLevel);
        group.setEducationForm(educationForm);
        group.setAccelerated(accelerated);
        group.setGroupNumber(request.getGroupNumber());
        group.setDirection(direction);
        return toDto(groupRepository.save(group), Map.of());
    }

    private void validateGroupCodeUnique(String code, Long currentGroupId) {
        groupRepository.findByCode(code).ifPresent(existingGroup -> {
            Long existingId = existingGroup.getId();
            boolean isSameGroup = currentGroupId != null && existingId != null && existingId.equals(currentGroupId);
            if (!isSameGroup) {
                throw new BusinessValidationException("Такая группа уже существует.");
            }
        });
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!groupRepository.existsById(id)) {
            throw new ResourceNotFoundException("Группа не найдена");
        }
        if (studentRepository.countByGroupId(id) > 0) {
            throw new BusinessValidationException("Перед удалением группы необходимо перевести всех студентов.");
        }
        historyRepository.clearGroupReference(id);
        groupRepository.deleteById(id);
    }

    @Override
    @Transactional
    public void deleteWithTransfer(Long id, GroupDeleteTransferRequest request) {
        StudentGroup sourceGroup = groupRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Группа не найдена"));
        List<Student> students = studentRepository.findAllByGroupId(id);
        if (!students.isEmpty()) {
            if (request == null || request.getTargetGroupId() == null) {
                throw new BusinessValidationException("Выберите группу, в которую будут переведены студенты.");
            }
            Long targetGroupId = request.getTargetGroupId();
            if (Objects.equals(targetGroupId, id)) {
                throw new BusinessValidationException("Группа перевода должна отличаться от удаляемой.");
            }
            StudentGroup targetGroup = groupRepository.findById(targetGroupId)
                    .orElseThrow(() -> new ResourceNotFoundException("Группа перевода не найдена"));

            Long sourceDirectionId = sourceGroup.getDirection() != null ? sourceGroup.getDirection().getId() : null;
            Long targetDirectionId = targetGroup.getDirection() != null ? targetGroup.getDirection().getId() : null;
            if (!Objects.equals(sourceDirectionId, targetDirectionId)) {
                throw new BusinessValidationException("При удалении группы перевод возможен только в группу этого же направления.");
            }
            if (!Objects.equals(sourceGroup.getCourse(), targetGroup.getCourse())) {
                throw new BusinessValidationException("При удалении группы перевод возможен только на тот же курс.");
            }
            if (!Objects.equals(sourceGroup.getEducationLevel(), targetGroup.getEducationLevel())
                    || !Objects.equals(sourceGroup.getEducationForm(), targetGroup.getEducationForm())
                    || !Objects.equals(Boolean.TRUE.equals(sourceGroup.getAccelerated()), Boolean.TRUE.equals(targetGroup.getAccelerated()))) {
                throw new BusinessValidationException("Группа перевода должна совпадать по уровню, форме и признаку ускоренного обучения.");
            }

            for (Student student : students) {
                student.setGroup(targetGroup);
                if (targetGroup.getCourse() != null) {
                    student.setCourse(targetGroup.getCourse());
                }
            }
            List<Student> saved = studentRepository.saveAll(students);
            LocalDate today = LocalDate.now();
            for (Student student : saved) {
                historyService.recordStudentState(student, today);
            }
        }

        if (studentRepository.countByGroupId(id) > 0) {
            throw new BusinessValidationException("Не удалось перевести всех студентов из удаляемой группы.");
        }
        historyRepository.clearGroupReference(id);
        groupRepository.deleteById(id);
    }

    private Map<Long, Long> loadStudentsByGroup(List<StudentGroup> groups) {
        if (groups.isEmpty()) {
            return Map.of();
        }
        List<Long> groupIds = groups.stream()
                .map(StudentGroup::getId)
                .filter(id -> id != null)
                .toList();
        if (groupIds.isEmpty()) {
            return Map.of();
        }
        return studentRepository.countStudentsByGroupIdsAndStatuses(
                        groupIds,
                        List.of(StudentStatus.ACTIVE, StudentStatus.ACADEMIC_LEAVE)
                ).stream()
                .collect(Collectors.toMap(
                        row -> (Long) row[0],
                        row -> (Long) row[1]
                ));
    }

    private StudentGroupDto toDto(StudentGroup group, Map<Long, Long> studentsByGroup) {
        Direction direction = group.getDirection();
        GroupCodeMeta meta = parseGroupCode(group.getCode());
        Integer course = group.getCourse() != null
                ? group.getCourse()
                : (meta != null ? meta.course() : null);
        Integer groupNumber = group.getGroupNumber() != null
                ? group.getGroupNumber()
                : (meta != null ? meta.groupNumber() : null);
        String educationLevel = normalizeEducationLevelSafe(group.getEducationLevel());
        if (educationLevel == null && meta != null) {
            educationLevel = meta.educationLevel();
        }
        String educationForm = normalizeEducationFormSafe(group.getEducationForm());
        if (educationForm == null && meta != null) {
            educationForm = meta.educationForm();
        }
        Boolean accelerated = group.getAccelerated();
        if (accelerated == null && meta != null) {
            accelerated = meta.accelerated();
        }
        return StudentGroupDto.builder()
                .id(group.getId())
                .code(group.getCode())
                .course(course)
                .educationLevel(educationLevel)
                .educationForm(educationForm)
                .accelerated(accelerated != null ? accelerated : Boolean.FALSE)
                .groupNumber(groupNumber)
                .directionId(direction != null ? direction.getId() : null)
                .directionName(direction != null ? direction.getName() : null)
                .directionShortName(resolveDirectionShortName(direction))
                .facultyId(direction != null && direction.getFaculty() != null ? direction.getFaculty().getId() : null)
                .facultyName(direction != null && direction.getFaculty() != null ? direction.getFaculty().getName() : null)
                .studentsCount(studentsByGroup.getOrDefault(group.getId(), 0L))
                .build();
    }

    private String normalizeEducationLevel(String value) {
        String normalized = normalizeEducationLevelSafe(value);
        if (normalized == null) {
            throw new BusinessValidationException("Уровень образования указан некорректно.");
        }
        return normalized;
    }

    private String normalizeEducationLevelSafe(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return switch (value.trim().toUpperCase(Locale.ROOT)) {
            case "BACHELOR" -> "BACHELOR";
            case "SPECIALIST" -> "SPECIALIST";
            case "MASTER" -> "MASTER";
            default -> null;
        };
    }

    private String normalizeEducationForm(String value) {
        String normalized = normalizeEducationFormSafe(value);
        if (normalized == null) {
            throw new BusinessValidationException("Форма обучения указана некорректно.");
        }
        return normalized;
    }

    private String normalizeEducationFormSafe(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return switch (value.trim().toUpperCase(Locale.ROOT)) {
            case "FULL_TIME" -> "FULL_TIME";
            case "PART_TIME" -> "PART_TIME";
            case "DISTANCE" -> "DISTANCE";
            default -> null;
        };
    }

    private void validateCourseForLevel(Integer course, String educationLevel, boolean accelerated) {
        if (course == null) {
            throw new BusinessValidationException("Курс не указан.");
        }
        int maxCourse = switch (educationLevel) {
            case "BACHELOR" -> accelerated ? 3 : 4;
            case "SPECIALIST" -> accelerated ? 4 : 5;
            case "MASTER" -> accelerated ? 1 : 2;
            default -> throw new BusinessValidationException("Уровень образования указан некорректно.");
        };
        if (course < 1 || course > maxCourse) {
            throw new BusinessValidationException("Выбранный курс недоступен для указанного уровня и формы ускоренного обучения.");
        }
    }

    private String buildGroupCode(Direction direction, Integer course, Integer groupNumber, String educationLevel, String educationForm, boolean accelerated) {
        if (groupNumber == null || groupNumber < 1 || groupNumber > 4) {
            throw new BusinessValidationException("Номер группы должен быть от 1 до 4.");
        }
        String directionShortName = resolveDirectionShortName(direction);
        if (directionShortName == null || directionShortName.isBlank()) {
            throw new BusinessValidationException("Для направления не удалось определить аббревиатуру.");
        }
        String levelSuffix = switch (educationLevel) {
            case "BACHELOR" -> "б";
            case "SPECIALIST" -> "с";
            case "MASTER" -> "м";
            default -> throw new BusinessValidationException("Уровень образования указан некорректно.");
        };
        String formSuffix = switch (educationForm) {
            case "FULL_TIME" -> "д";
            case "PART_TIME" -> "в";
            case "DISTANCE" -> "з";
            default -> throw new BusinessValidationException("Форма обучения указана некорректно.");
        };
        String acceleratedSuffix = accelerated ? "у" : "";
        return directionShortName.toUpperCase(Locale.ROOT) + levelSuffix + formSuffix + acceleratedSuffix + "-" + course + groupNumber;
    }

    private String resolveDirectionShortName(Direction direction) {
        if (direction == null) {
            return null;
        }
        String explicitShortName = direction.getShortName();
        if (explicitShortName != null && !explicitShortName.isBlank()) {
            return explicitShortName.trim().toUpperCase(Locale.ROOT);
        }
        String name = direction.getName();
        if (name == null || name.isBlank()) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        String[] words = name.trim().split("\\s+");
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
        return builder.isEmpty() ? null : builder.toString();
    }

    private GroupCodeMeta parseGroupCode(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        Matcher matcher = GROUP_CODE_PATTERN.matcher(code);
        if (!matcher.matches()) {
            return null;
        }
        String level = switch (Character.toLowerCase(matcher.group(2).charAt(0))) {
            case 'б' -> "BACHELOR";
            case 'с' -> "SPECIALIST";
            case 'м' -> "MASTER";
            default -> null;
        };
        String form = switch (Character.toLowerCase(matcher.group(3).charAt(0))) {
            case 'д' -> "FULL_TIME";
            case 'в' -> "PART_TIME";
            case 'з' -> "DISTANCE";
            default -> null;
        };
        if (level == null || form == null) {
            return null;
        }
        boolean accelerated = matcher.group(4) != null && !matcher.group(4).isBlank();
        Integer parsedCourse = Integer.parseInt(matcher.group(5));
        Integer parsedGroupNumber = Integer.parseInt(matcher.group(6));
        return new GroupCodeMeta(level, form, accelerated, parsedCourse, parsedGroupNumber);
    }

    private record GroupCodeMeta(
            String educationLevel,
            String educationForm,
            Boolean accelerated,
            Integer course,
            Integer groupNumber
    ) {
    }
}
