package ru.university.piaps.dto;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class CurriculumDto {
    Long id;
    Integer course;
    Integer semester;
    String discipline;
    Integer hours;
    String attestation;
    Boolean courseWork;
    String educationLevel;
    String educationForm;
    Boolean accelerated;
    Integer planYear;
    Long directionId;
    String directionName;
    Long facultyId;
    String facultyName;
}
