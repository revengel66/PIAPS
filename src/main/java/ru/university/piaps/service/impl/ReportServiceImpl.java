package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.ContingentAggregationRow;
import ru.university.piaps.dto.ContingentReportResponse;
import ru.university.piaps.dto.ContingentReportRow;
import ru.university.piaps.repository.StudentRepository;
import ru.university.piaps.service.ReportService;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ReportServiceImpl implements ReportService {

    private final StudentRepository studentRepository;

    @Override
    @Transactional(readOnly = true)
    public ContingentReportResponse getContingentReport(LocalDate fromDate, LocalDate toDate) {
        LocalDate effectiveFrom = fromDate != null ? fromDate : LocalDate.of(1, 1, 1);
        LocalDate effectiveTo = toDate != null ? toDate : LocalDate.of(9999, 12, 31);

        List<ContingentAggregationRow> groupRows = studentRepository.aggregateByGroup(effectiveFrom, effectiveTo);

        List<ContingentReportRow> groups = groupRows.stream()
                .map(this::toReportRow)
                .toList();

        List<ContingentReportRow> directions = aggregateByDirection(groupRows);
        List<ContingentReportRow> faculties = aggregateByFaculty(groupRows);

        long total = groupRows.stream().mapToLong(ContingentAggregationRow::getTotal).sum();

        return ContingentReportResponse.builder()
                .fromDate(fromDate)
                .toDate(toDate)
                .total(total)
                .faculties(faculties)
                .directions(directions)
                .groups(groups)
                .build();
    }

    private List<ContingentReportRow> aggregateByDirection(List<ContingentAggregationRow> groupRows) {
        Map<Long, Totals> totals = new LinkedHashMap<>();
        Map<Long, ContingentAggregationRow> sample = new LinkedHashMap<>();

        for (ContingentAggregationRow row : groupRows) {
            Long directionId = row.getDirectionId() == null ? -1L : row.getDirectionId();
            totals.computeIfAbsent(directionId, k -> new Totals()).add(row);
            sample.putIfAbsent(directionId, row);
        }

        List<ContingentReportRow> result = new ArrayList<>();
        for (Map.Entry<Long, Totals> entry : totals.entrySet()) {
            ContingentAggregationRow origin = sample.get(entry.getKey());
            Totals t = entry.getValue();
            result.add(ContingentReportRow.builder()
                    .facultyId(origin.getFacultyId())
                    .facultyName(defaultValue(origin.getFacultyName(), "Без факультета"))
                    .directionId(origin.getDirectionId())
                    .directionName(defaultValue(origin.getDirectionName(), "Без направления"))
                    .groupId(null)
                    .groupCode(null)
                    .total(t.total)
                    .active(t.active)
                    .academicLeave(t.academicLeave)
                    .expelled(t.expelled)
                    .graduated(t.graduated)
                    .build());
        }
        return result;
    }

    private List<ContingentReportRow> aggregateByFaculty(List<ContingentAggregationRow> groupRows) {
        Map<Long, Totals> totals = new LinkedHashMap<>();
        Map<Long, ContingentAggregationRow> sample = new LinkedHashMap<>();

        for (ContingentAggregationRow row : groupRows) {
            Long facultyId = row.getFacultyId() == null ? -1L : row.getFacultyId();
            totals.computeIfAbsent(facultyId, k -> new Totals()).add(row);
            sample.putIfAbsent(facultyId, row);
        }

        List<ContingentReportRow> result = new ArrayList<>();
        for (Map.Entry<Long, Totals> entry : totals.entrySet()) {
            ContingentAggregationRow origin = sample.get(entry.getKey());
            Totals t = entry.getValue();
            result.add(ContingentReportRow.builder()
                    .facultyId(origin.getFacultyId())
                    .facultyName(defaultValue(origin.getFacultyName(), "Без факультета"))
                    .directionId(null)
                    .directionName(null)
                    .groupId(null)
                    .groupCode(null)
                    .total(t.total)
                    .active(t.active)
                    .academicLeave(t.academicLeave)
                    .expelled(t.expelled)
                    .graduated(t.graduated)
                    .build());
        }
        return result;
    }

    private ContingentReportRow toReportRow(ContingentAggregationRow row) {
        return ContingentReportRow.builder()
                .facultyId(row.getFacultyId())
                .facultyName(defaultValue(row.getFacultyName(), "Без факультета"))
                .directionId(row.getDirectionId())
                .directionName(defaultValue(row.getDirectionName(), "Без направления"))
                .groupId(row.getGroupId())
                .groupCode(row.getGroupCode())
                .total(row.getTotal())
                .active(row.getActive())
                .academicLeave(row.getAcademicLeave())
                .expelled(row.getExpelled())
                .graduated(row.getGraduated())
                .build();
    }

    private String defaultValue(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static class Totals {
        long total;
        long active;
        long academicLeave;
        long expelled;
        long graduated;

        void add(ContingentAggregationRow row) {
            total += row.getTotal();
            active += row.getActive();
            academicLeave += row.getAcademicLeave();
            expelled += row.getExpelled();
            graduated += row.getGraduated();
        }
    }
}
