package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.StudentDto;
import ru.university.piaps.dto.StudentPageResponse;
import ru.university.piaps.dto.StudentRequest;
import ru.university.piaps.dto.StudentSearchCriteria;
import ru.university.piaps.exception.ResourceNotFoundException;
import ru.university.piaps.model.Student;
import ru.university.piaps.model.StudentGroup;
import ru.university.piaps.repository.StudentGroupRepository;
import ru.university.piaps.repository.StudentRepository;
import ru.university.piaps.service.StudentService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StudentServiceImpl implements StudentService {

    private final StudentRepository studentRepository;
    private final StudentGroupRepository groupRepository;

    @Override
    @Transactional(readOnly = true)
    public List<StudentDto> findStudents(StudentSearchCriteria criteria) {
        StudentSearchCriteria safeCriteria = criteria == null ? StudentSearchCriteria.builder().build() : criteria;
        Specification<Student> spec = StudentSpecifications.fromCriteria(safeCriteria);
        return studentRepository.findAll(spec).stream()
                .map(this::toDto)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public StudentPageResponse findStudentsPage(StudentSearchCriteria criteria, int page, int size) {
        StudentSearchCriteria safeCriteria = criteria == null ? StudentSearchCriteria.builder().build() : criteria;
        Specification<Student> spec = StudentSpecifications.fromCriteria(safeCriteria);
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Order.asc("lastName"), Sort.Order.asc("firstName")));
        Page<Student> result = studentRepository.findAll(spec, pageRequest);
        List<StudentDto> content = result.getContent().stream().map(this::toDto).toList();
        return StudentPageResponse.builder()
                .content(content)
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .page(result.getNumber())
                .size(result.getSize())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public StudentDto findById(Long id) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Студент не найден"));
        return toDto(student);
    }

    @Override
    @Transactional
    public StudentDto create(StudentRequest request) {
        StudentGroup group = groupRepository.findById(request.getGroupId())
                .orElseThrow(() -> new ResourceNotFoundException("Группа не найдена"));
        Student student = Student.builder()
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .middleName(request.getMiddleName())
                .recordBook(request.getRecordBook())
                .course(request.getCourse())
                .status(request.getStatus())
                .birthDate(request.getBirthDate())
                .phone(request.getPhone())
                .email(request.getEmail())
                .enrollmentDate(request.getEnrollmentDate())
                .group(group)
                .build();
        return toDto(studentRepository.save(student));
    }

    @Override
    @Transactional
    public StudentDto update(Long id, StudentRequest request) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Студент не найден"));
        StudentGroup group = groupRepository.findById(request.getGroupId())
                .orElseThrow(() -> new ResourceNotFoundException("Группа не найдена"));

        student.setFirstName(request.getFirstName());
        student.setLastName(request.getLastName());
        student.setMiddleName(request.getMiddleName());
        student.setRecordBook(request.getRecordBook());
        student.setCourse(request.getCourse());
        student.setStatus(request.getStatus());
        student.setBirthDate(request.getBirthDate());
        student.setPhone(request.getPhone());
        student.setEmail(request.getEmail());
        student.setEnrollmentDate(request.getEnrollmentDate());
        student.setGroup(group);
        return toDto(studentRepository.save(student));
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!studentRepository.existsById(id)) {
            throw new ResourceNotFoundException("Студент не найден");
        }
        studentRepository.deleteById(id);
    }

    private StudentDto toDto(Student student) {
        StudentGroup group = student.getGroup();
        String directionName = group != null && group.getDirection() != null ? group.getDirection().getName() : null;
        String facultyName = null;
        if (group != null && group.getDirection() != null && group.getDirection().getFaculty() != null) {
            facultyName = group.getDirection().getFaculty().getName();
        }
        return StudentDto.builder()
                .id(student.getId())
                .lastName(student.getLastName())
                .firstName(student.getFirstName())
                .middleName(student.getMiddleName())
                .fullName(student.getFullName())
                .recordBook(student.getRecordBook())
                .course(student.getCourse())
                .status(student.getStatus())
                .groupId(group != null ? group.getId() : null)
                .groupCode(group != null ? group.getCode() : null)
                .directionName(directionName)
                .facultyName(facultyName)
                .phone(student.getPhone())
                .email(student.getEmail())
                .birthDate(student.getBirthDate())
                .enrollmentDate(student.getEnrollmentDate())
                .build();
    }
}
