package ru.university.piaps.exception;

import lombok.Value;

import java.time.Instant;

@Value
public class ApiError {
    Instant timestamp = Instant.now();
    String message;
}
