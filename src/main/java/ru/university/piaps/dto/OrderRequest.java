package ru.university.piaps.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import ru.university.piaps.model.OrderType;

import java.time.LocalDate;

@Data
public class OrderRequest {
    @NotBlank
    private String number;

    @NotNull
    private LocalDate orderDate;

    @NotNull
    private OrderType type;

    private LocalDate signDate;
    private String signerPosition;
    private String signerName;
    private String studentsList;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private String basis;
    private String directionName;
    private String groupCode;
    private String educationForm;
    private String educationBase;
    private String costInfo;
    private LocalDate expelDate;
    private String contractInfo;
    private String oldDirection;
    private String oldGroup;
    private String newDirection;
    private String newGroup;
    private Integer previousCourse;
    private Integer nextCourse;
}
