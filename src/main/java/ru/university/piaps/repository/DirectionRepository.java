package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.university.piaps.model.Direction;

import java.util.List;

public interface DirectionRepository extends JpaRepository<Direction, Long> {
    List<Direction> findAllByFacultyId(Long facultyId);
}
