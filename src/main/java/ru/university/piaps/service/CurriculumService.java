package ru.university.piaps.service;

import ru.university.piaps.dto.CurriculumDto;

import java.util.List;

public interface CurriculumService {
    List<CurriculumDto> findAll(Long directionId);
}
