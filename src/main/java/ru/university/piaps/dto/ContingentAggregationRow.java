package ru.university.piaps.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ContingentAggregationRow {
    private final Long facultyId;
    private final String facultyName;
    private final Long directionId;
    private final String directionName;
    private final Long groupId;
    private final String groupCode;
    private final Integer groupCourse;
    private final long total;
    private final long active;
    private final long academicLeave;
    private final long expelled;
    private final long graduated;
}
