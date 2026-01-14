package ru.university.piaps.dto;

import lombok.Builder;
import lombok.Value;
import ru.university.piaps.model.StudentStatus;

import java.time.LocalDate;

@Value
@Builder
public class StudentDto {
    Long id;
    String lastName;
    String firstName;
    String middleName;
    String fullName;
    String recordBook;
    Integer course;
    StudentStatus status;
    Long groupId;
    String groupCode;
    String directionName;
    String facultyName;
    String phone;
    String email;
    LocalDate birthDate;
    LocalDate enrollmentDate;
}
