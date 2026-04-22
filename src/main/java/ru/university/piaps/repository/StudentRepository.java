package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.university.piaps.dto.ContingentAggregationRow;
import ru.university.piaps.model.Student;
import ru.university.piaps.model.StudentStatus;

import java.time.LocalDate;
import java.util.List;

public interface StudentRepository extends JpaRepository<Student, Long>, JpaSpecificationExecutor<Student> {
    boolean existsByRecordBook(String recordBook);

    boolean existsByRecordBookAndIdNot(String recordBook, Long id);

    @Query(value = """
            select exists(
                select 1
                from students s
                where to_char(s.study_start_date, 'YY') = :recordYear
                  and right(lpad(regexp_replace(coalesce(s.record_book, ''), '[^0-9]', '', 'g'), 3, '0'), 3) = :recordSuffix
                  and (:excludedStudentId is null or s.id <> :excludedStudentId)
            )
            """, nativeQuery = true)
    boolean existsByNormalizedRecordBook(@Param("recordYear") String recordYear,
                                         @Param("recordSuffix") String recordSuffix,
                                         @Param("excludedStudentId") Long excludedStudentId);

    boolean existsByStudyContractNumber(String studyContractNumber);

    boolean existsByStudyContractNumberAndIdNot(String studyContractNumber, Long id);

    @Query(value = """
            select exists(
                select 1
                from students s
                where to_char(s.study_start_date, 'YYYY') = :contractYear
                  and right(lpad(regexp_replace(coalesce(s.study_contract_number, ''), '[^0-9]', '', 'g'), 3, '0'), 3) = :contractSuffix
                  and (:excludedStudentId is null or s.id <> :excludedStudentId)
            )
            """, nativeQuery = true)
    boolean existsByNormalizedStudyContractNumber(@Param("contractYear") String contractYear,
                                                  @Param("contractSuffix") String contractSuffix,
                                                  @Param("excludedStudentId") Long excludedStudentId);

    @Query("""
            select new ru.university.piaps.dto.ContingentAggregationRow(
                f.id, f.name, d.id, d.name, g.id, g.code, g.course,
                count(s),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.ACTIVE then 1 else 0 end),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.ACADEMIC_LEAVE then 1 else 0 end),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.EXPELLED then 1 else 0 end),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.GRADUATED then 1 else 0 end)
            )
            from Student s
            left join s.group g
            left join g.direction d
            left join d.faculty f
            where (
                s.studyStartDate is null
                or (
                    s.studyStartDate >= :fromDate
                and s.studyStartDate <= :toDate
                )
            )
            group by f.id, f.name, d.id, d.name, g.id, g.code, g.course
            order by f.name, d.name, g.code, g.course
            """)
    List<ContingentAggregationRow> aggregateByGroup(@Param("fromDate") LocalDate fromDate,
                                                    @Param("toDate") LocalDate toDate);

    @Query("""
            select s.id
            from Student s
            where (
                s.studyStartDate is null
                or (
                    s.studyStartDate >= :fromDate
                and s.studyStartDate <= :toDate
                )
            )
            """)
    List<Long> findIdsByStudyStartDateRange(@Param("fromDate") LocalDate fromDate,
                                            @Param("toDate") LocalDate toDate);

    @Query("""
            select new ru.university.piaps.dto.ContingentAggregationRow(
                f.id, f.name, d.id, d.name, g.id, g.code, g.course,
                count(s),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.ACTIVE then 1 else 0 end),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.ACADEMIC_LEAVE then 1 else 0 end),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.EXPELLED then 1 else 0 end),
                sum(case when s.status = ru.university.piaps.model.StudentStatus.GRADUATED then 1 else 0 end)
            )
            from Student s
            left join s.group g
            left join g.direction d
            left join d.faculty f
            where s.id in :studentIds
            group by f.id, f.name, d.id, d.name, g.id, g.code, g.course
            order by f.name, d.name, g.code, g.course
            """)
    List<ContingentAggregationRow> aggregateByStudentIds(@Param("studentIds") List<Long> studentIds);

    @Query("""
            select g.direction.id, count(s)
            from Student s
            join s.group g
            where g.direction.id in :directionIds
              and s.status in :statuses
            group by g.direction.id
            """)
    List<Object[]> countStudentsByDirectionIdsAndStatuses(@Param("directionIds") List<Long> directionIds,
                                                          @Param("statuses") List<StudentStatus> statuses);

    @Query("""
            select g.id, count(s)
            from Student s
            join s.group g
            where g.id in :groupIds
              and s.status in :statuses
            group by g.id
            """)
    List<Object[]> countStudentsByGroupIdsAndStatuses(@Param("groupIds") List<Long> groupIds,
                                                      @Param("statuses") List<StudentStatus> statuses);

    @Query("""
            select d.faculty.id, count(s)
            from Student s
            join s.group g
            join g.direction d
            where d.faculty.id in :facultyIds
              and s.status in :statuses
            group by d.faculty.id
            """)
    List<Object[]> countStudentsByFacultyIdsAndStatuses(@Param("facultyIds") List<Long> facultyIds,
                                                        @Param("statuses") List<StudentStatus> statuses);

    List<Student> findAllByGroupDirectionId(Long directionId);

    List<Student> findAllByGroupDirectionIdIn(List<Long> directionIds);

    List<Student> findAllByGroupId(Long groupId);

    long countByGroupDirectionId(Long directionId);

    long countByGroupDirectionFacultyId(Long facultyId);

    long countByGroupId(Long groupId);
}
