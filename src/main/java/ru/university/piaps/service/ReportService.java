package ru.university.piaps.service;

import ru.university.piaps.dto.ContingentReportResponse;

import java.time.LocalDate;

public interface ReportService {
    ContingentReportResponse getContingentReport(LocalDate fromDate, LocalDate toDate);
}
