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
import java.util.regex.Pattern;

final class StudentSpecifications {

    private static final Pattern RECORD_BOOK_FULL_PATTERN = Pattern.compile("^\\d{2}/\\d{3}$");
    private static final Pattern RECORD_BOOK_YEAR_PATTERN = Pattern.compile("^\\d{2}$");
    private static final Pattern RECORD_BOOK_SUFFIX_PATTERN = Pattern.compile("^\\d{3}$");

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
                predicates.add(cb.equal(groupJoin.get("course"), criteria.getCourse()));
            }
            if (criteria.getEducationLevel() != null && !criteria.getEducationLevel().isBlank()) {
                predicates.add(cb.equal(groupJoin.get("educationLevel"), criteria.getEducationLevel().trim()));
            }
            if (criteria.getEducationForm() != null && !criteria.getEducationForm().isBlank()) {
                predicates.add(cb.equal(groupJoin.get("educationForm"), criteria.getEducationForm().trim()));
            }
            if (criteria.getAccelerated() != null) {
                predicates.add(cb.equal(groupJoin.get("accelerated"), criteria.getAccelerated()));
            }
            if (criteria.getStatus() != null) {
                predicates.add(cb.equal(root.get("status"), criteria.getStatus()));
            }
            if (criteria.getSearch() != null && !criteria.getSearch().isBlank()) {
                String normalizedSearch = criteria.getSearch().trim().toLowerCase();
                String pattern = "%" + normalizedSearch + "%";
                var recordBookNormalized = cb.lower(cb.coalesce(root.get("recordBook"), cb.literal("")));

                if (RECORD_BOOK_FULL_PATTERN.matcher(normalizedSearch).matches()) {
                    predicates.add(cb.equal(recordBookNormalized, normalizedSearch));
                } else if (RECORD_BOOK_YEAR_PATTERN.matcher(normalizedSearch).matches()) {
                    predicates.add(cb.like(recordBookNormalized, normalizedSearch + "/%"));
                } else if (RECORD_BOOK_SUFFIX_PATTERN.matcher(normalizedSearch).matches()) {
                    predicates.add(cb.like(recordBookNormalized, "%/" + normalizedSearch));
                } else {
                    String[] tokens = normalizedSearch.split("\\s+");
                    if (tokens.length > 1) {
                        List<Predicate> tokenPredicates = new ArrayList<>();
                        for (String token : tokens) {
                            if (token == null || token.isBlank()) {
                                continue;
                            }
                            String tokenPattern = "%" + token + "%";
                            tokenPredicates.add(cb.or(
                                    cb.like(cb.lower(root.get("lastName")), tokenPattern),
                                    cb.like(cb.lower(root.get("firstName")), tokenPattern),
                                    cb.like(cb.lower(root.get("middleName")), tokenPattern),
                                    cb.like(cb.lower(groupJoin.get("code")), tokenPattern),
                                    cb.like(recordBookNormalized, tokenPattern)
                            ));
                        }
                        if (!tokenPredicates.isEmpty()) {
                            predicates.add(cb.and(tokenPredicates.toArray(new Predicate[0])));
                        }
                    } else {
                        predicates.add(cb.or(
                                cb.like(cb.lower(root.get("lastName")), pattern),
                                cb.like(cb.lower(root.get("firstName")), pattern),
                                cb.like(cb.lower(root.get("middleName")), pattern),
                                cb.like(cb.lower(groupJoin.get("code")), pattern),
                                cb.like(recordBookNormalized, pattern)
                        ));
                    }
                }
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
