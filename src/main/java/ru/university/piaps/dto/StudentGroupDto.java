package ru.university.piaps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
    private String code;
    @NotNull
    @Min(value = 1, message = "Курс должен быть не меньше 1")
    @Max(value = 5, message = "Курс должен быть не больше 5")
    private Integer course;
    @NotBlank
    @Pattern(regexp = "^(BACHELOR|SPECIALIST|MASTER)$", message = "Уровень образования указан некорректно")
    private String educationLevel;
    @NotBlank
    @Pattern(regexp = "^(FULL_TIME|PART_TIME|DISTANCE)$", message = "Форма обучения указана некорректно")
    private String educationForm;
    @NotNull
    private Boolean accelerated;
    @NotNull
    @Min(value = 1, message = "Номер группы должен быть не меньше 1")
    @Max(value = 4, message = "Номер группы должен быть не больше 4")
    private Integer groupNumber;
    @NotNull
    private Long directionId;
    private String directionName;
    private String directionShortName;
    private Long facultyId;
    private String facultyName;
    private Long studentsCount;
}
