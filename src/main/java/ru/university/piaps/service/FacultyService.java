package ru.university.piaps.service;

import ru.university.piaps.dto.FacultyDeleteTransferRequest;
import ru.university.piaps.dto.FacultyDto;

import java.util.List;

public interface FacultyService {
    List<FacultyDto> findAll();
    FacultyDto create(FacultyDto request);
    FacultyDto update(Long id, FacultyDto request);
    void delete(Long id);
    void deleteWithTransfer(Long id, FacultyDeleteTransferRequest request);
}
