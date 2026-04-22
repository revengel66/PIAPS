package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.university.piaps.model.StudentGroup;

import java.util.List;
import java.util.Optional;

public interface StudentGroupRepository extends JpaRepository<StudentGroup, Long> {
    List<StudentGroup> findAllByDirectionId(Long directionId);
    List<StudentGroup> findAllByDirectionIdIn(List<Long> directionIds);
    void deleteAllByDirectionId(Long directionId);
    void deleteAllByDirectionIdIn(List<Long> directionIds);
    Optional<StudentGroup> findByCode(String code);
}
