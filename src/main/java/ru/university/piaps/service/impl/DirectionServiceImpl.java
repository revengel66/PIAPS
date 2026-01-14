package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.DirectionDto;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.Direction;
import ru.university.piaps.model.Faculty;
import ru.university.piaps.repository.DirectionRepository;
import ru.university.piaps.repository.FacultyRepository;
import ru.university.piaps.service.DirectionService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DirectionServiceImpl implements DirectionService {

    private final DirectionRepository directionRepository;
    private final FacultyRepository facultyRepository;

    @Override
    @Transactional(readOnly = true)
    public List<DirectionDto> findAll(Long facultyId) {
        List<Direction> source = facultyId == null
                ? directionRepository.findAll()
                : directionRepository.findAllByFacultyId(facultyId);
        return source.stream().map(this::toDto).toList();
    }

    @Override
    @Transactional
    public DirectionDto create(DirectionDto request) {
        Faculty faculty = facultyRepository.findById(request.getFacultyId())
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));
        Direction direction = Direction.builder()
                .code(request.getCode())
                .name(request.getName())
                .faculty(faculty)
                .build();
        return toDto(directionRepository.save(direction));
    }

    @Override
    @Transactional
    public DirectionDto update(Long id, DirectionDto request) {
        Direction direction = directionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Направление не найдено"));
        Faculty faculty = facultyRepository.findById(request.getFacultyId())
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));
        direction.setCode(request.getCode());
        direction.setName(request.getName());
        direction.setFaculty(faculty);
        return toDto(directionRepository.save(direction));
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!directionRepository.existsById(id)) {
            throw new ResourceNotFoundException("Направление не найдено");
        }
        directionRepository.deleteById(id);
    }

    private DirectionDto toDto(Direction direction) {
        return DirectionDto.builder()
                .id(direction.getId())
                .code(direction.getCode())
                .name(direction.getName())
                .facultyId(direction.getFaculty() != null ? direction.getFaculty().getId() : null)
                .facultyName(direction.getFaculty() != null ? direction.getFaculty().getName() : null)
                .build();
    }
}
