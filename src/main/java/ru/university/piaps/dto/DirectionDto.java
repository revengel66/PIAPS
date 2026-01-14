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
public class DirectionDto {
    private Long id;
    @NotBlank
    private String code;
    @NotBlank
    private String name;
    @NotNull
    private Long facultyId;
    private String facultyName;
}
