package com.example.dolibarr.repository;

import com.example.dolibarr.entity.JourFerie;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface JourFerieRepository extends JpaRepository<JourFerie, Long> {

    boolean existsByDate(LocalDate date);

    Optional<JourFerie> findByDate(LocalDate date);
}
