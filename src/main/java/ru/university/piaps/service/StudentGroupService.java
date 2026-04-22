package ru.university.piaps.service;

import ru.university.piaps.dto.GroupDeleteTransferRequest;
import ru.university.piaps.dto.StudentGroupDto;

import java.util.List;

public interface StudentGroupService {
    List<StudentGroupDto> findAll(Long directionId);
    StudentGroupDto create(StudentGroupDto request);
    StudentGroupDto update(Long id, StudentGroupDto request);
    void delete(Long id);
    void deleteWithTransfer(Long id, GroupDeleteTransferRequest request);
}
