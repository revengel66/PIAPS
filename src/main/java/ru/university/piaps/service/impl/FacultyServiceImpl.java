package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.FacultyDto;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.Faculty;
import ru.university.piaps.repository.FacultyRepository;
import ru.university.piaps.service.FacultyService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class FacultyServiceImpl implements FacultyService {

    private final FacultyRepository facultyRepository;

    @Override
    @Transactional(readOnly = true)
    public List<FacultyDto> findAll() {
        return facultyRepository.findAll().stream()
                .map(this::toDto)
                .toList();
    }

    @Override
    @Transactional
    public FacultyDto create(FacultyDto request) {
        Faculty faculty = Faculty.builder()
                .code(request.getCode())
                .name(request.getName())
                .build();
        return toDto(facultyRepository.save(faculty));
    }

    @Override
    @Transactional
    public FacultyDto update(Long id, FacultyDto request) {
        Faculty faculty = facultyRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Факультет не найден"));
        faculty.setCode(request.getCode());
        faculty.setName(request.getName());
        return toDto(facultyRepository.save(faculty));
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!facultyRepository.existsById(id)) {
            throw new ResourceNotFoundException("Факультет не найден");
        }
        facultyRepository.deleteById(id);
    }

    private FacultyDto toDto(Faculty faculty) {
        return FacultyDto.builder()
                .id(faculty.getId())
                .code(faculty.getCode())
                .name(faculty.getName())
                .build();
    }
}
