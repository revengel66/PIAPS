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
import ru.university.piaps.dto.DirectionDeleteTransferRequest;
import ru.university.piaps.dto.DirectionDto;
import ru.university.piaps.service.DirectionService;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/directions")
public class DirectionController {

    private final DirectionService directionService;

    @GetMapping
    public List<DirectionDto> findAll(@RequestParam(required = false) Long facultyId) {
        return directionService.findAll(facultyId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DirectionDto create(@RequestBody @Valid DirectionDto request) {
        return directionService.create(request);
    }

    @PutMapping("/{id}")
    public DirectionDto update(@PathVariable Long id, @RequestBody @Valid DirectionDto request) {
        return directionService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        directionService.delete(id);
    }

    @PostMapping("/{id}/delete-with-transfer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteWithTransfer(@PathVariable Long id, @RequestBody DirectionDeleteTransferRequest request) {
        directionService.deleteWithTransfer(id, request);
    }
}
