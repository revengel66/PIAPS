package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.university.piaps.model.Faculty;

public interface FacultyRepository extends JpaRepository<Faculty, Long> {
}
