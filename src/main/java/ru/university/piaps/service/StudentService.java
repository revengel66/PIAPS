package ru.university.piaps.service;

import ru.university.piaps.dto.StudentDto;
import ru.university.piaps.dto.StudentPageResponse;
import ru.university.piaps.dto.StudentRequest;
import ru.university.piaps.dto.StudentSearchCriteria;

import java.util.List;

public interface StudentService {
    List<StudentDto> findStudents(StudentSearchCriteria criteria);
    StudentPageResponse findStudentsPage(StudentSearchCriteria criteria, int page, int size, String sortBy, String sortDirection);
    StudentDto findById(Long id);
    StudentDto create(StudentRequest request);
    StudentDto update(Long id, StudentRequest request);
    void delete(Long id);
}
