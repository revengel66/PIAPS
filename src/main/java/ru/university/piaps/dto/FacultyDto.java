package ru.university.piaps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FacultyDto {
    private Long id;
    @NotBlank(message = "Название факультета обязательно")
    @Size(min = 6, max = 80, message = "Название факультета должно быть от 6 до 80 символов")
    @Pattern(
            regexp = "^[A-Za-zА-Яа-яЁё\\-\\s]+$",
            message = "Название факультета выглядит некорректно."
    )
    private String name;
    @Size(max = 32, message = "Аббревиатура факультета должна быть не длиннее 32 символов")
    private String shortName;
    private Long studentsCount;
}
