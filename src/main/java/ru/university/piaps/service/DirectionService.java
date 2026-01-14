package ru.university.piaps.service;

import ru.university.piaps.dto.DirectionDto;

import java.util.List;

public interface DirectionService {
    List<DirectionDto> findAll(Long facultyId);
    DirectionDto create(DirectionDto request);
    DirectionDto update(Long id, DirectionDto request);
    void delete(Long id);
}
