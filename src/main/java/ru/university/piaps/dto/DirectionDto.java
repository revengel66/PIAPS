package ru.university.piaps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DirectionDto {
    private Long id;
    @NotBlank
    @Pattern(regexp = "\\d{2}\\.\\d{2}\\.\\d{2}", message = "Код направления должен быть в формате 00.00.00")
    private String code;
    @NotBlank
    @Size(min = 6, max = 80, message = "Название направления должно быть от 6 до 80 символов")
    @Pattern(
            regexp = "^[\\p{L}\\-\\s]+$",
            message = "Название направления выглядит некорректно."
    )
    private String name;
    @NotNull
    private Long facultyId;
    private String facultyName;
    @Size(max = 16, message = "Аббревиатура направления должна быть не длиннее 16 символов")
    @Pattern(
            regexp = "^$|^[\\p{L}\\p{N}\\-]+$",
            message = "Аббревиатура направления может содержать только буквы, цифры и дефис"
    )
    private String shortName;
    @Pattern(
            regexp = "^$|^\\d{1,8}([.,]\\d{1,2})?$",
            message = "Размер оплаты должен быть числом (до 8 цифр в целой части и до 2 знаков после запятой)"
    )
    private String annualTuition;
    private LocalDateTime createdAt;
    private Long studentsCount;
}
