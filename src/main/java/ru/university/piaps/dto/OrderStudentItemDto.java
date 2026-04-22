package ru.university.piaps.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderStudentItemDto {
    private Long studentId;
    private String studentName;
    private String basis;

    private Integer fromCourse;
    private Integer toCourse;
    private Boolean hasAcademicDebts;

    private String facultyName;
    private String facultyShortName;
    private String fromGroup;
    private String toGroup;
    private String fromDirection;
    private String toDirection;
    private Long fromDirectionId;
    private Long toDirectionId;
    private Long fromGroupId;
    private Long toGroupId;

    private String educationForm;
    private String educationBase;

    private LocalDate periodStart;
    private LocalDate periodEnd;
    private LocalDate studyStartDate;
    private LocalDate studyEndDate;

    private String specialityName;
    private String contractInfo;
    private String contractNumber;
    private String tuitionAmount;
    private String extraInfo;
}
