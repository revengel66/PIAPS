package ru.university.piaps.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ru.university.piaps.dto.StudentDto;
import ru.university.piaps.dto.StudentPageResponse;
import ru.university.piaps.dto.StudentRequest;
import ru.university.piaps.dto.StudentSearchCriteria;
import ru.university.piaps.model.StudentStatus;
import ru.university.piaps.service.StudentService;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/students")
public class StudentController {

    private final StudentService studentService;

    @GetMapping
    public List<StudentDto> findAll(@RequestParam(required = false) Long facultyId,
                                    @RequestParam(required = false) Long directionId,
                                    @RequestParam(required = false) Long groupId,
                                    @RequestParam(required = false) Integer course,
                                    @RequestParam(required = false) String educationLevel,
                                    @RequestParam(required = false) String educationForm,
                                    @RequestParam(required = false) Boolean accelerated,
                                    @RequestParam(required = false) StudentStatus status,
                                    @RequestParam(required = false) String search) {
        StudentSearchCriteria criteria = StudentSearchCriteria.builder()
                .facultyId(facultyId)
                .directionId(directionId)
                .groupId(groupId)
                .course(course)
                .educationLevel(educationLevel)
                .educationForm(educationForm)
                .accelerated(accelerated)
                .status(status)
                .search(search)
                .build();
        return studentService.findStudents(criteria);
    }

    @GetMapping("/search")
    public StudentPageResponse findPaged(@RequestParam(required = false) Long facultyId,
                                         @RequestParam(required = false) Long directionId,
                                         @RequestParam(required = false) Long groupId,
                                         @RequestParam(required = false) Integer course,
                                         @RequestParam(required = false) String educationLevel,
                                         @RequestParam(required = false) String educationForm,
                                         @RequestParam(required = false) Boolean accelerated,
                                         @RequestParam(required = false) StudentStatus status,
                                         @RequestParam(required = false) String search,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "10") int size,
                                         @RequestParam(defaultValue = "id") String sortBy,
                                         @RequestParam(defaultValue = "desc") String sortDirection) {
        StudentSearchCriteria criteria = StudentSearchCriteria.builder()
                .facultyId(facultyId)
                .directionId(directionId)
                .groupId(groupId)
                .course(course)
                .educationLevel(educationLevel)
                .educationForm(educationForm)
                .accelerated(accelerated)
                .status(status)
                .search(search)
                .build();
        return studentService.findStudentsPage(criteria, page, size, sortBy, sortDirection);
    }

    @GetMapping("/{id}")
    public StudentDto findById(@PathVariable Long id) {
        return studentService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StudentDto create(@RequestBody @Valid StudentRequest request) {
        return studentService.create(request);
    }

    @PutMapping("/{id}")
    public StudentDto update(@PathVariable Long id, @RequestBody @Valid StudentRequest request) {
        return studentService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        studentService.delete(id);
    }
}
