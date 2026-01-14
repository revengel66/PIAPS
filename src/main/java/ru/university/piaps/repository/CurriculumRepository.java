package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.university.piaps.model.Curriculum;

import java.util.List;

public interface CurriculumRepository extends JpaRepository<Curriculum, Long> {
    List<Curriculum> findAllByDirectionId(Long directionId);
}
