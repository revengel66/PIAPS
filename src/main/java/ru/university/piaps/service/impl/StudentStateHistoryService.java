package ru.university.piaps.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.OrderStudentItemDto;
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

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class StudentStateHistoryService {

    private static final TypeReference<List<OrderStudentItemDto>> STUDENT_ITEM_LIST_TYPE = new TypeReference<>() {
    };

    private final StudentStateHistoryRepository historyRepository;
    private final StudentRepository studentRepository;
    private final StudentGroupRepository groupRepository;
    private final OrderDocumentRepository orderRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void ensureBootstrapped() {
        if (historyRepository.count() > 0) {
            return;
        }
        rebuildFromExistingData();
    }

    @Transactional
    public void rebuildFromExistingData() {
        historyRepository.deleteAllInBatch();

        List<Student> students = studentRepository.findAll();
        Map<Long, Student> studentById = new LinkedHashMap<>();
        for (Student student : students) {
            studentById.put(student.getId(), student);
        }

        Map<String, StudentGroup> groupByCode = new HashMap<>();
        for (StudentGroup group : groupRepository.findAll()) {
            if (group.getCode() != null) {
                groupByCode.put(group.getCode().trim(), group);
            }
        }

        List<OrderDocument> orders = orderRepository.findAllByOrderByOrderDateAscIdAsc();
        Map<Long, LocalDate> firstOrderDateByStudent = new HashMap<>();
        Map<Long, OrderStudentItemDto> firstItemByStudent = new HashMap<>();
        for (OrderDocument order : orders) {
            if (!Boolean.TRUE.equals(order.getExecuted())) {
                continue;
            }
            Map<Long, OrderStudentItemDto> itemByStudentId = parseItemMap(order.getStudentItemsJson());
            for (Long studentId : parseStudentIds(order.getStudentIds())) {
                if (!firstOrderDateByStudent.containsKey(studentId)) {
                    firstOrderDateByStudent.put(studentId, order.getOrderDate());
                    firstItemByStudent.put(studentId, itemByStudentId.get(studentId));
                }
            }
        }

        Map<Long, MutableState> states = new HashMap<>();
        List<StudentStateHistory> batch = new ArrayList<>();

        for (Student student : students) {
            LocalDate firstOrderDate = firstOrderDateByStudent.get(student.getId());
            OrderStudentItemDto firstItem = firstItemByStudent.get(student.getId());
            boolean hasOrders = firstOrderDate != null;

            StudentGroup initialGroup = resolveGroup(
                    firstItem != null ? firstItem.getFromGroup() : null,
                    groupByCode,
                    student.getGroup()
            );

            Integer initialCourse = firstItem != null && firstItem.getFromCourse() != null
                    ? firstItem.getFromCourse()
                    : (student.getCourse() != null
                    ? student.getCourse()
                    : (initialGroup != null ? initialGroup.getCourse() : 1));

            MutableState state = new MutableState(
                    hasOrders ? StudentStatus.ACTIVE : (student.getStatus() != null ? student.getStatus() : StudentStatus.ACTIVE),
                    initialCourse != null ? initialCourse : 1,
                    initialGroup
            );
            states.put(student.getId(), state);

            LocalDate baselineDate = student.getStudyStartDate();
            if (baselineDate == null && firstOrderDate != null) {
                baselineDate = firstOrderDate.minusDays(1);
            }
            if (baselineDate == null) {
                baselineDate = LocalDate.now();
            }
            batch.add(buildRecord(student, baselineDate, state.status, state.course, state.group, null));
        }

        for (OrderDocument order : orders) {
            if (!Boolean.TRUE.equals(order.getExecuted())) {
                continue;
            }
            Map<Long, OrderStudentItemDto> itemByStudentId = parseItemMap(order.getStudentItemsJson());
            for (Long studentId : parseStudentIds(order.getStudentIds())) {
                Student student = studentById.get(studentId);
                if (student == null) {
                    continue;
                }
                MutableState current = states.computeIfAbsent(studentId, ignored -> {
                    StudentGroup fallbackGroup = student.getGroup();
                    int fallbackCourse = student.getCourse() != null
                            ? student.getCourse()
                            : (fallbackGroup != null && fallbackGroup.getCourse() != null ? fallbackGroup.getCourse() : 1);
                    return new MutableState(StudentStatus.ACTIVE, fallbackCourse, fallbackGroup);
                });
                OrderStudentItemDto item = itemByStudentId.get(studentId);
                applyOrder(order.getType(), current, item, groupByCode);
                batch.add(buildRecord(student, order.getOrderDate(), current.status, current.course, current.group, order));
            }
        }

        historyRepository.saveAll(batch);
    }

    @Transactional
    public void recordStudentState(Student student, LocalDate effectiveDate) {
        if (student == null || student.getId() == null) {
            return;
        }
        ensureBootstrapped();
        LocalDate date = effectiveDate != null ? effectiveDate : LocalDate.now();
        if (isSameAsLast(student, date, student.getStatus(), student.getCourse(), student.getGroup())) {
            return;
        }
        historyRepository.save(buildRecord(
                student,
                date,
                student.getStatus(),
                student.getCourse(),
                student.getGroup(),
                null
        ));
    }

    @Transactional
    public void recordOrderStateChanges(OrderDocument order, List<Student> students) {
        if (order == null || order.getOrderDate() == null || students == null || students.isEmpty()) {
            return;
        }
        ensureBootstrapped();
        List<StudentStateHistory> batch = new ArrayList<>();
        for (Student student : students) {
            if (student == null || student.getId() == null) {
                continue;
            }
            if (isSameAsLast(student, order.getOrderDate(), student.getStatus(), student.getCourse(), student.getGroup())) {
                continue;
            }
            batch.add(buildRecord(
                    student,
                    order.getOrderDate(),
                    student.getStatus(),
                    student.getCourse(),
                    student.getGroup(),
                    order
            ));
        }
        if (!batch.isEmpty()) {
            historyRepository.saveAll(batch);
        }
    }

    private boolean isSameAsLast(Student student,
                                 LocalDate effectiveDate,
                                 StudentStatus status,
                                 Integer course,
                                 StudentGroup group) {
        return historyRepository.findTopByStudentIdOrderByEffectiveDateDescIdDesc(student.getId())
                .map(last -> last.getEffectiveDate().equals(effectiveDate)
                        && last.getStatus() == status
                        && safeEquals(last.getCourse(), course)
                        && safeEquals(last.getGroup() != null ? last.getGroup().getId() : null, group != null ? group.getId() : null))
                .orElse(false);
    }

    private void applyOrder(OrderType type,
                            MutableState state,
                            OrderStudentItemDto item,
                            Map<String, StudentGroup> groupByCode) {
        if (type == null) {
            return;
        }
        switch (type) {
            case ACADEMIC_LEAVE -> state.status = StudentStatus.ACADEMIC_LEAVE;
            case EXPULSION -> state.status = StudentStatus.EXPELLED;
            case ENROLLMENT -> {
                state.status = StudentStatus.ACTIVE;
                StudentGroup targetGroup = resolveGroup(item != null ? item.getToGroup() : null, groupByCode, state.group);
                state.group = targetGroup;
                if (item != null && item.getToCourse() != null) {
                    state.course = item.getToCourse();
                } else if (targetGroup != null && targetGroup.getCourse() != null) {
                    state.course = targetGroup.getCourse();
                } else {
                    state.course = 1;
                }
            }
            case TRANSFER_DIRECTION -> {
                state.status = StudentStatus.ACTIVE;
                StudentGroup targetGroup = resolveGroup(item != null ? item.getToGroup() : null, groupByCode, state.group);
                if (targetGroup != null) {
                    state.group = targetGroup;
                }
                if (item != null && item.getToCourse() != null) {
                    state.course = item.getToCourse();
                } else if (targetGroup != null && targetGroup.getCourse() != null) {
                    state.course = targetGroup.getCourse();
                }
            }
            case TRANSFER_NEXT_COURSE -> {
                state.status = StudentStatus.ACTIVE;
                StudentGroup targetGroup = resolveGroup(item != null ? item.getToGroup() : null, groupByCode, state.group);
                if (targetGroup != null) {
                    state.group = targetGroup;
                }
                if (item != null && item.getToCourse() != null) {
                    state.course = item.getToCourse();
                } else if (targetGroup != null && targetGroup.getCourse() != null) {
                    state.course = targetGroup.getCourse();
                } else {
                    state.course = Math.max(1, state.course + 1);
                }
            }
            default -> {
                // no-op
            }
        }
    }

    private StudentGroup resolveGroup(String code, Map<String, StudentGroup> groupByCode, StudentGroup fallback) {
        if (code == null || code.isBlank()) {
            return fallback;
        }
        StudentGroup group = groupByCode.get(code.trim());
        return group != null ? group : fallback;
    }

    private Map<Long, OrderStudentItemDto> parseItemMap(String rawJson) {
        Map<Long, OrderStudentItemDto> result = new HashMap<>();
        if (rawJson == null || rawJson.isBlank()) {
            return result;
        }
        try {
            List<OrderStudentItemDto> parsed = objectMapper.readValue(rawJson, STUDENT_ITEM_LIST_TYPE);
            if (parsed == null) {
                return result;
            }
            for (OrderStudentItemDto item : parsed) {
                if (item != null && item.getStudentId() != null) {
                    result.put(item.getStudentId(), item);
                }
            }
        } catch (Exception ignored) {
            // игнорируем некорректный JSON в старых данных
        }
        return result;
    }

    private List<Long> parseStudentIds(String rawIds) {
        if (rawIds == null || rawIds.isBlank()) {
            return List.of();
        }
        List<Long> result = new ArrayList<>();
        for (String chunk : rawIds.split(",")) {
            String value = chunk == null ? "" : chunk.trim();
            if (value.isEmpty()) {
                continue;
            }
            try {
                result.add(Long.parseLong(value));
            } catch (NumberFormatException ignored) {
                // ignore
            }
        }
        return result;
    }

    private StudentStateHistory buildRecord(Student student,
                                            LocalDate effectiveDate,
                                            StudentStatus status,
                                            Integer course,
                                            StudentGroup group,
                                            OrderDocument order) {
        return StudentStateHistory.builder()
                .student(student)
                .effectiveDate(effectiveDate != null ? effectiveDate : LocalDate.now())
                .status(status != null ? status : StudentStatus.ACTIVE)
                .course(course != null ? course : 1)
                .group(group)
                .order(order)
                .build();
    }

    private boolean safeEquals(Object left, Object right) {
        return left == null ? right == null : left.equals(right);
    }

    private static class MutableState {
        private StudentStatus status;
        private int course;
        private StudentGroup group;

        private MutableState(StudentStatus status, int course, StudentGroup group) {
            this.status = status;
            this.course = course;
            this.group = group;
        }
    }
}
