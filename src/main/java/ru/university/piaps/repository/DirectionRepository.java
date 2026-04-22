package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.university.piaps.model.Direction;

import java.util.List;
import java.util.Optional;

public interface DirectionRepository extends JpaRepository<Direction, Long> {
    List<Direction> findAllByFacultyId(Long facultyId);
    Optional<Direction> findByIdAndFacultyId(Long id, Long facultyId);
    void deleteAllByFacultyId(Long facultyId);
    boolean existsByShortNameIgnoreCase(String shortName);
    boolean existsByShortNameIgnoreCaseAndIdNot(String shortName, Long id);
}
