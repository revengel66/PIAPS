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
    Long directionId;
    String directionCode;
    String directionName;
    Long facultyId;
    String facultyName;
    String facultyShortName;
    String educationForm;
    String educationBase;
    Boolean hasAcademicDebts;
    String studyContractNumber;
    LocalDate studyStartDate;
    String phone;
    String email;
    LocalDate birthDate;
}
