package ru.university.piaps.dto;

import lombok.Getter;
import lombok.ToString;
import ru.university.piaps.model.StudentStatus;

@Getter
@ToString
public class StudentSearchCriteria {
    private final Long facultyId;
    private final Long directionId;
    private final Long groupId;
    private final Integer course;
    private final String educationLevel;
    private final String educationForm;
    private final Boolean accelerated;
    private final String search;
    private final StudentStatus status;

    private StudentSearchCriteria(Builder builder) {
        this.facultyId = builder.facultyId;
        this.directionId = builder.directionId;
        this.groupId = builder.groupId;
        this.course = builder.course;
        this.educationLevel = builder.educationLevel;
        this.educationForm = builder.educationForm;
        this.accelerated = builder.accelerated;
        this.search = builder.search;
        this.status = builder.status;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private Long facultyId;
        private Long directionId;
        private Long groupId;
        private Integer course;
        private String educationLevel;
        private String educationForm;
        private Boolean accelerated;
        private String search;
        private StudentStatus status;

        public Builder facultyId(Long facultyId) {
            this.facultyId = facultyId;
            return this;
        }

        public Builder directionId(Long directionId) {
            this.directionId = directionId;
            return this;
        }

        public Builder groupId(Long groupId) {
            this.groupId = groupId;
            return this;
        }

        public Builder course(Integer course) {
            this.course = course;
            return this;
        }

        public Builder educationLevel(String educationLevel) {
            this.educationLevel = educationLevel;
            return this;
        }

        public Builder educationForm(String educationForm) {
            this.educationForm = educationForm;
            return this;
        }

        public Builder accelerated(Boolean accelerated) {
            this.accelerated = accelerated;
            return this;
        }

        public Builder search(String search) {
            this.search = search;
            return this;
        }

        public Builder status(StudentStatus status) {
            this.status = status;
            return this;
        }

        public StudentSearchCriteria build() {
            return new StudentSearchCriteria(this);
        }
    }
}
