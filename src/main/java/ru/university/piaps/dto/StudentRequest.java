package ru.university.piaps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import ru.university.piaps.model.StudentStatus;

import java.time.LocalDate;

@Data
public class StudentRequest {
    @NotBlank(message = "Укажите фамилию.")
    @Size(min = 2, max = 40, message = "Фамилия должна быть длиной от 2 до 40 символов.")
    @Pattern(regexp = "^[A-Za-zА-Яа-яЁё\\-]+$", message = "Фамилия выглядит некорректно.")
    private String lastName;
    @NotBlank(message = "Укажите имя.")
    @Size(min = 2, max = 40, message = "Имя должно быть длиной от 2 до 40 символов.")
    @Pattern(regexp = "^[A-Za-zА-Яа-яЁё\\-]+$", message = "Имя выглядит некорректно.")
    private String firstName;
    @Size(max = 40, message = "Отчество должно быть длиной от 2 до 40 символов.")
    @Pattern(regexp = "^$|^[A-Za-zА-Яа-яЁё\\-]+$", message = "Отчество выглядит некорректно.")
    private String middleName;
    @NotBlank
    @Pattern(regexp = "^\\d{2}/\\d{3}$", message = "Номер зачётной книжки должен быть в формате 20/658")
    private String recordBook;
    @NotNull
    @Min(value = 1, message = "Курс должен быть не меньше 1")
    @Max(value = 5, message = "Курс должен быть не больше 5")
    private Integer course;
    @NotNull
    private StudentStatus status;
    @NotNull
    private Long groupId;
    @NotBlank
    @Pattern(regexp = "^(Очная|Очно-заочная|Заочная)$", message = "Форма обучения указана некорректно")
    private String educationForm;
    @NotBlank
    @Pattern(regexp = "^(Бюджет|Внебюджет)$", message = "Основа обучения должна быть «Бюджет» или «Внебюджет»")
    private String educationBase;
    private Boolean hasAcademicDebts;
    @NotBlank
    @Pattern(regexp = "^\\d{4}-З-\\d{3}$", message = "Номер договора должен быть в формате 2025-З-001")
    private String studyContractNumber;
    private LocalDate studyStartDate;
    @Size(max = 18)
    @Pattern(regexp = "^$|^\\+7 \\(\\d{3}\\) \\d{3}-\\d{2}-\\d{2}$", message = "Телефон должен быть в формате +7 (000) 000-00-00")
    private String phone;
    @Email(message = "Некорректный email")
    @Size(max = 128)
    private String email;
    private LocalDate birthDate;
}
