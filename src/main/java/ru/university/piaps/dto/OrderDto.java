package ru.university.piaps.dto;

import lombok.Builder;
import lombok.Value;
import ru.university.piaps.model.OrderType;

import java.time.LocalDate;

@Value
@Builder
public class OrderDto {
    Long id;
    String number;
    LocalDate orderDate;
    OrderType type;
    String text;
    LocalDate signDate;
    String signerPosition;
    String signerName;
    String studentsList;
    LocalDate periodStart;
    LocalDate periodEnd;
    String basis;
    String directionName;
    String groupCode;
    String educationForm;
    String educationBase;
    String costInfo;
    LocalDate expelDate;
    String contractInfo;
    String oldDirection;
    String oldGroup;
    String newDirection;
    String newGroup;
    Integer previousCourse;
    Integer nextCourse;
}
