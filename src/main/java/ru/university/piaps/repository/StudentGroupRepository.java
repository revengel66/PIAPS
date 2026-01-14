package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.university.piaps.model.StudentGroup;

import java.util.List;

public interface StudentGroupRepository extends JpaRepository<StudentGroup, Long> {
    List<StudentGroup> findAllByDirectionId(Long directionId);
}
