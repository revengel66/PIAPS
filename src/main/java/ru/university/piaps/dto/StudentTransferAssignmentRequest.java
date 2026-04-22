package ru.university.piaps.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StudentTransferAssignmentRequest {
    private Long studentId;
    private Long targetGroupId;
}

