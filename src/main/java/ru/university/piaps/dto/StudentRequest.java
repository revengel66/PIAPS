package ru.university.piaps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;
import ru.university.piaps.model.StudentStatus;

import java.time.LocalDate;

@Data
public class StudentRequest {
    @NotBlank
    private String lastName;
    @NotBlank
    private String firstName;
    private String middleName;
    @NotBlank
    private String recordBook;
    @NotNull
    private Integer course;
    @NotNull
    private StudentStatus status;
    @NotNull
    private Long groupId;
    @Size(max = 32)
    private String phone;
    @Size(max = 128)
    private String email;
    private LocalDate birthDate;
    private LocalDate enrollmentDate;
}
