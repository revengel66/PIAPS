package ru.university.piaps.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FacultyDeleteTransferRequest {
    private List<StudentTransferAssignmentRequest> assignments;
}

