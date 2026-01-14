package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.StudentGroupDto;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.Direction;
import ru.university.piaps.model.StudentGroup;
import ru.university.piaps.repository.DirectionRepository;
import ru.university.piaps.repository.StudentGroupRepository;
import ru.university.piaps.service.StudentGroupService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StudentGroupServiceImpl implements StudentGroupService {

    private final StudentGroupRepository groupRepository;
    private final DirectionRepository directionRepository;

    @Override
    @Transactional(readOnly = true)
    public List<StudentGroupDto> findAll(Long directionId) {
        List<StudentGroup> groups = directionId == null
                ? groupRepository.findAll()
                : groupRepository.findAllByDirectionId(directionId);
        return groups.stream().map(this::toDto).toList();
    }

    @Override
    @Transactional
    public StudentGroupDto create(StudentGroupDto request) {
        Direction direction = directionRepository.findById(request.getDirectionId())
                .orElseThrow(() -> new ResourceNotFoundException("Направление не найдено"));
        StudentGroup group = StudentGroup.builder()
                .code(request.getCode())
                .course(request.getCourse())
                .direction(direction)
                .build();
        return toDto(groupRepository.save(group));
    }

    @Override
    @Transactional
    public StudentGroupDto update(Long id, StudentGroupDto request) {
        StudentGroup group = groupRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Группа не найдена"));
        Direction direction = directionRepository.findById(request.getDirectionId())
                .orElseThrow(() -> new ResourceNotFoundException("Направление не найдено"));
        group.setCode(request.getCode());
        group.setCourse(request.getCourse());
        group.setDirection(direction);
        return toDto(groupRepository.save(group));
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!groupRepository.existsById(id)) {
            throw new ResourceNotFoundException("Группа не найдена");
        }
        groupRepository.deleteById(id);
    }

    private StudentGroupDto toDto(StudentGroup group) {
        Direction direction = group.getDirection();
        return StudentGroupDto.builder()
                .id(group.getId())
                .code(group.getCode())
                .course(group.getCourse())
                .directionId(direction != null ? direction.getId() : null)
                .directionName(direction != null ? direction.getName() : null)
                .facultyId(direction != null && direction.getFaculty() != null ? direction.getFaculty().getId() : null)
                .facultyName(direction != null && direction.getFaculty() != null ? direction.getFaculty().getName() : null)
                .build();
    }
}
