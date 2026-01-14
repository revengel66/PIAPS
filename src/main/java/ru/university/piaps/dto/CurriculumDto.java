package ru.university.piaps.dto;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class CurriculumDto {
    Long id;
    Integer course;
    String discipline;
    Integer hours;
    String attestation;
    Long directionId;
    String directionName;
}
