package ru.university.piaps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentGroupDto {
    private Long id;
    @NotBlank
    private String code;
    @NotNull
    private Integer course;
    @NotNull
    private Long directionId;
    private String directionName;
    private Long facultyId;
    private String facultyName;
}
