package ru.university.piaps.dto;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class ContingentReportRow {
    Long facultyId;
    String facultyName;
    Long directionId;
    String directionName;
    Long groupId;
    String groupCode;

    long total;
    long active;
    long academicLeave;
    long expelled;
    long graduated;
}
