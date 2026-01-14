package ru.university.piaps.dto;

import lombok.Builder;
import lombok.Value;

import java.time.LocalDate;
import java.util.List;

@Value
@Builder
public class ContingentReportResponse {
    LocalDate fromDate;
    LocalDate toDate;
    long total;

    List<ContingentReportRow> faculties;
    List<ContingentReportRow> directions;
    List<ContingentReportRow> groups;
}
