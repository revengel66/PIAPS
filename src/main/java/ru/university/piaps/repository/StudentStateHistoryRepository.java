package ru.university.piaps.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import ru.university.piaps.dto.ContingentAggregationRow;
import ru.university.piaps.model.StudentStateHistory;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface StudentStateHistoryRepository extends JpaRepository<StudentStateHistory, Long> {

    Optional<StudentStateHistory> findTopByStudentIdOrderByEffectiveDateDescIdDesc(Long studentId);
    Optional<StudentStateHistory> findTopByStudentIdAndOrderIsNotNullOrderByEffectiveDateDescIdDesc(Long studentId);
    void deleteAllByStudentId(Long studentId);
    List<StudentStateHistory> findAllByOrderIdOrderByIdAsc(Long orderId);
    void deleteAllByOrderId(Long orderId);

    @Modifying
    @Query("""
            update StudentStateHistory h
            set h.order = null
            where h.order.id = :orderId
            """)
    void clearOrderReference(@Param("orderId") Long orderId);

    @Modifying
    @Query("""
            update StudentStateHistory h
            set h.group = null
            where h.group.id = :groupId
            """)
    void clearGroupReference(@Param("groupId") Long groupId);

    @Modifying
    @Query("""
            update StudentStateHistory h
            set h.group = null
            where h.group.id in :groupIds
            """)
    void clearGroupReferences(@Param("groupIds") List<Long> groupIds);

    @Query("""
            select new ru.university.piaps.dto.ContingentAggregationRow(
                f.id, f.name, d.id, d.name, g.id, g.code, g.course,
                count(h),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.ACTIVE then 1 else 0 end),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.ACADEMIC_LEAVE then 1 else 0 end),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.EXPELLED then 1 else 0 end),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.GRADUATED then 1 else 0 end)
            )
            from StudentStateHistory h
            left join h.group g
            left join g.direction d
            left join d.faculty f
            where h.effectiveDate <= :snapshotDate
              and (
                  h.status not in (
                      ru.university.piaps.model.StudentStatus.EXPELLED,
                      ru.university.piaps.model.StudentStatus.GRADUATED
                  )
                  or h.effectiveDate >= :fromDate
              )
              and not exists (
                  select 1
                  from StudentStateHistory h2
                  where h2.student = h.student
                    and h2.effectiveDate <= :snapshotDate
                    and (
                        h2.effectiveDate > h.effectiveDate
                        or (h2.effectiveDate = h.effectiveDate and h2.id > h.id)
                    )
              )
            group by f.id, f.name, d.id, d.name, g.id, g.code, g.course
            order by f.name, d.name, g.code, g.course
            """)
    List<ContingentAggregationRow> aggregateSnapshot(@Param("snapshotDate") LocalDate snapshotDate,
                                                     @Param("fromDate") LocalDate fromDate);

    @Query("""
            select new ru.university.piaps.dto.ContingentAggregationRow(
                f.id, f.name, d.id, d.name, g.id, g.code, h.course,
                count(h),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.ACTIVE then 1 else 0 end),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.ACADEMIC_LEAVE then 1 else 0 end),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.EXPELLED then 1 else 0 end),
                sum(case when h.status = ru.university.piaps.model.StudentStatus.GRADUATED then 1 else 0 end)
            )
            from StudentStateHistory h
            left join h.group g
            left join g.direction d
            left join d.faculty f
            where h.effectiveDate <= :toDate
              and not exists (
                  select 1
                  from StudentStateHistory hs
                  where hs.student = h.student
                    and hs.effectiveDate = h.effectiveDate
                    and hs.id > h.id
              )
              and coalesce(
                  (
                      select min(h2.effectiveDate)
                      from StudentStateHistory h2
                      where h2.student = h.student
                        and h2.effectiveDate > h.effectiveDate
                  ),
                  :openEndedDate
              ) > :fromDate
            group by f.id, f.name, d.id, d.name, g.id, g.code, h.course
            order by f.name, d.name, g.code, h.course
            """)
    List<ContingentAggregationRow> aggregateByPeriod(@Param("fromDate") LocalDate fromDate,
                                                     @Param("toDate") LocalDate toDate,
                                                     @Param("openEndedDate") LocalDate openEndedDate);
}
