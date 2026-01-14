package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.university.piaps.dto.ContingentAggregationRow;
import ru.university.piaps.model.Student;

import java.time.LocalDate;
import java.util.List;

public interface StudentRepository extends JpaRepository<Student, Long>, JpaSpecificationExecutor<Student> {
    @Query("""
            select new ru.university.piaps.dto.ContingentAggregationRow(
                f.id, f.name, d.id, d.name, g.id, g.code,
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
                s.enrollmentDate is null
                or (
                    s.enrollmentDate >= :fromDate
                and s.enrollmentDate <= :toDate
                )
            )
            group by f.id, f.name, d.id, d.name, g.id, g.code
            order by f.name, d.name, g.code
            """)
    List<ContingentAggregationRow> aggregateByGroup(@Param("fromDate") LocalDate fromDate,
                                                    @Param("toDate") LocalDate toDate);
}
