package ru.university.piaps.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ru.university.piaps.dto.GroupDeleteTransferRequest;
import ru.university.piaps.dto.StudentGroupDto;
import ru.university.piaps.service.StudentGroupService;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/groups")
public class StudentGroupController {

    private final StudentGroupService groupService;

    @GetMapping
    public List<StudentGroupDto> findAll(@RequestParam(required = false) Long directionId) {
        return groupService.findAll(directionId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StudentGroupDto create(@RequestBody @Valid StudentGroupDto request) {
        return groupService.create(request);
    }

    @PutMapping("/{id}")
    public StudentGroupDto update(@PathVariable Long id, @RequestBody @Valid StudentGroupDto request) {
        return groupService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        groupService.delete(id);
    }

    @PostMapping("/{id}/delete-with-transfer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteWithTransfer(@PathVariable Long id, @RequestBody GroupDeleteTransferRequest request) {
        groupService.deleteWithTransfer(id, request);
    }
}
