package ru.university.piaps.service.impl;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import ru.university.piaps.dto.StudentSearchCriteria;
import ru.university.piaps.model.Direction;
import ru.university.piaps.model.Faculty;
import ru.university.piaps.model.Student;
import ru.university.piaps.model.StudentGroup;

import java.util.ArrayList;
import java.util.List;

final class StudentSpecifications {

    private StudentSpecifications() {
    }

    static Specification<Student> fromCriteria(StudentSearchCriteria criteria) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            Join<Student, StudentGroup> groupJoin = root.join("group", JoinType.LEFT);
            Join<StudentGroup, Direction> directionJoin = groupJoin.join("direction", JoinType.LEFT);
            Join<Direction, Faculty> facultyJoin = directionJoin.join("faculty", JoinType.LEFT);

            if (criteria.getGroupId() != null) {
                predicates.add(cb.equal(groupJoin.get("id"), criteria.getGroupId()));
            }
            if (criteria.getDirectionId() != null) {
                predicates.add(cb.equal(directionJoin.get("id"), criteria.getDirectionId()));
            }
            if (criteria.getFacultyId() != null) {
                predicates.add(cb.equal(facultyJoin.get("id"), criteria.getFacultyId()));
            }
            if (criteria.getCourse() != null) {
                predicates.add(cb.equal(root.get("course"), criteria.getCourse()));
            }
            if (criteria.getStatus() != null) {
                predicates.add(cb.equal(root.get("status"), criteria.getStatus()));
            }
            if (criteria.getSearch() != null && !criteria.getSearch().isBlank()) {
                String pattern = "%" + criteria.getSearch().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("lastName")), pattern),
                        cb.like(cb.lower(root.get("firstName")), pattern),
                        cb.like(cb.lower(root.get("middleName")), pattern),
                        cb.like(cb.lower(root.get("recordBook")), pattern)
                ));
            }
            query.distinct(true);
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
