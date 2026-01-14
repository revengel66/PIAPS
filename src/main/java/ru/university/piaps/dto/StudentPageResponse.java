package ru.university.piaps.dto;

import lombok.Builder;
import lombok.Value;

import java.util.List;

@Value
@Builder
public class StudentPageResponse {
    List<StudentDto> content;
    long totalElements;
    int totalPages;
    int page;
    int size;
}
